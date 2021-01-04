// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/**
 * @title Compeer Contract
 * @author Will Hennessy
 */
contract Compeer {
        using SafeERC20 for IERC20;
        using SafeMath for uint;
    
    /// @dev Contract design follows the one-to-many model with one Funder related to many VestingCarrots
    /// https://medium.com/robhitchens/enforcing-referential-integrity-in-ethereum-smart-contracts-a9ab1427ff42
    
    /// @notice Record details for a Funder. 
    /// @dev This could be a DAO multisig, an individual, or an organization.
    /// @notice id - Internal ID of the funder
    /// @notice carrotIds - IDs of all the VestingCarrots funded by this funder.
    /// @notice funder - The wallet address who created this VestingCarrot and funds it. Only the funder can deposit funds into the VestingCarrot.
    /// @notice admins - List of addresses with admin power to execute non-monetary write transactions such as create, modify, and propose deposit.
    struct Funder {
        uint id; // TODO // supports the delete function
        uint[] carrotIds;
        address funder;
        address[] admins; // TODO: look into OpenZeppelin for the most secure way of handling admins.
        string name;
        string description;
        string imageUrl;
    }

    /// @notice The Funder record corresponding to each address.
    mapping (address => Funder) public funders;
    /// @notice List of all funders who have ever created a carrot.
    address[] public fundersList;

    /**
     * @notice Record details for a Vesting Carrot
     * @notice funder - The address of the funder who created and deposits to this carrot.
     * @notice startTime - The unix time at which vesting begins.
     * @notice vestingPeriodLength - The period of time (in seconds) between each vesting event. Set to 0 for real-time vesting.
     * @notice amountPerPeriod - The amount of token to vest to the recipient per period.
     * @notice cliffTime - Prior to this unix timestamp, tokens are vesting but not able to be withdrawn by recipient until this timestamp.
     * @notice endTime - The time at which vesting will stop.
     * @notice amountWithdrawn - Cumulative amount of token that has been withrawn by recipient since startTime.
     * @notice balance - Current balance of token deposited by the Funder and allocated to this Carrot. Some portion of these funds may have vested already, but not yet withdrawn.
     * @notice message - Optional message for the Funder to use. For example, to explain the purpose of this vesting package.
     */
    struct VestingCarrot {
        address recipient;
        address token;
        address funder;
        uint id; // TODO - used to delete
        uint startTime;
        uint vestingPeriodLength;
        uint amountPerPeriod;
        uint cliffTime;
        uint endTime;  // TODO:  can be infinite - how? 0? less than startTime? max uint?  do i even need this? maybe # of periods instead? - count how many passed already
        uint amountWithdrawn;
        uint balance; // TODO: can balance can be negative? (arrears) If Funder deposits while in this state, then contract should payout immediately.
        string message;
    }

    /// @notice List of all VestingCarrots ordered by ID
    mapping (uint => VestingCarrot) public vestingCarrots;
    uint public nextVestingCarrotId;

    /// @notice List of all VestingCarrots owned by a given address
    mapping (address => uint[]) public recipientToVestingCarrotIds;

    /// @notice adminFunders[admin] returns list of all Funders for whom admin is admin.
    mapping (address => address[]) public adminFunders;
    /// TODO: don't think I need the above mapping

    /// @notice isAdmin[admin][funder] = true if admin is an admin for this funder.
    mapping (address => mapping (address => bool)) public isAdmin;


    /// @notice An event thats emitted when a new Funder is registered
    event FunderRegistered(address indexed funder, uint indexed id);
    
    /// @notice An event thats emitted when a new VestingCarrot is minted
    event VestingCarrotMinted(address indexed recipient, address indexed funder, uint indexed vestingCarrotId);

    /// @notice An event thats emitted when funds are deposited into the contract
    event Deposited(address indexed from, uint indexed vestingCarrotId, uint amount);

    /// @notice An event thats emitted when funds are withdrawn from the contract
    event Withdrawn(address indexed to, uint indexed vestingCarrotId, uint amount);

    // TODO: event FunderDeleted  (remember to only allow if zero carrots)
    // TODO: event VestingCarrotTerminated

    // TODO: event FunderUpdated
    // TODO: event CarrotUpdated
    
    // TODO: think about event logging
    // getPastEvents({ filter: funderId }) + fancy javascript math to calculate historicals
    // getPastEvents({ filter: funderId }) + to get most recent transactions - might need additional lookup to get all data about each tx


    /// @notice Register your address as a new Funder
    function registerFunder(
        address[] calldata _admins,
        string calldata _name,
        string calldata _description,
        string calldata _imageUrl)
    external returns (uint) {
        require(!isFunder(msg.sender), "Funder already exists");
        
        fundersList.push(msg.sender);
        Funder storage f = funders[msg.sender];
        f.id = fundersList.length - 1;
        // f.carrotIds is already init to an empty array.
        f.funder = msg.sender;
        f.admins = _admins;
        f.name = _name;
        f.description = _description;
        f.imageUrl = _imageUrl;
        
        for (uint i = 0; i < _admins.length; i++) {
            // TODO: does funder need to be in admin? is funder allowed to be admin?
            adminFunders[_admins[i]].push(msg.sender);
            isAdmin[_admins[i]][msg.sender] = true;
        }

        emit FunderRegistered(msg.sender, fundersList.length - 1);
        return fundersList.length - 1;
    }

    /// @notice Mint a new Vesting Carrot with 0 balance.
    function mintVestingCarrot(
        address _recipient,
        address _token,
        uint _startTime,
        uint _vestingPeriodLength,
        uint _amountPerPeriod,
        uint _cliffTime,
        uint _endTime,
        string calldata _message)
    external returns (uint) {
        require(isFunder(msg.sender), "Must register as funder first");
        require(_recipient != address(0), "Recipient cant be the zero address");
        require(_startTime >= block.timestamp, "Start time is in the past");
        require(_cliffTime >= _startTime, "Cliff time must be >= start time");
        require(_endTime > _startTime && _endTime > _cliffTime, "End time must be > start time and cliff time");
        require(_vestingPeriodLength <= (_endTime.sub(_startTime)), "Period must be < duration");
        require(_vestingPeriodLength > 0, "Vesting Period must be >0");
        require(_amountPerPeriod > 0, "Amount must be >0");
        
        vestingCarrots[nextVestingCarrotId] = VestingCarrot({
            recipient: _recipient,
            token: _token,
            funder: msg.sender,
            id: funders[msg.sender].id,
            startTime: _startTime,
            vestingPeriodLength: _vestingPeriodLength,
            amountPerPeriod: _amountPerPeriod,
            cliffTime: _cliffTime,
            endTime: _endTime,
            amountWithdrawn: 0,
            balance: 0,
            message: _message
        });
        
        funders[msg.sender].carrotIds.push(nextVestingCarrotId);
        recipientToVestingCarrotIds[_recipient].push(nextVestingCarrotId);
        emit VestingCarrotMinted(_recipient, msg.sender, nextVestingCarrotId);
        nextVestingCarrotId++;
        return nextVestingCarrotId-1;
    }

    /// @notice Deposit funds to N vesting carrots
    function deposit(uint _vestingCarrotId, uint _amount, address _tokenId) external payable {
        require(isCarrot(_vestingCarrotId), "Carrot does not exist");
        require(isFunderOfCarrot(msg.sender, _vestingCarrotId), "Only the funder can deposit to a carrot");
        require(_amount > 0, "amount is zero");

        // TODO: transfer the funds into this contract
        // IERC20(_tokenId).safeTransferFrom(msg.sender, address(this), _amount);

        // add to balance. (if balance was negative, pay out immediately?)
        // create an internal-only helper function that takes 1 of each param instead of array
        // emit Deposited event (1 or N times?)
    }

    /// @notice Deposit funds to N vesting carrots
    function depositMany(uint[] calldata _vestingCarrotIds, uint[] calldata _amounts, address[] calldata _tokenIds) external payable {
        // TODO
        // require all three arrays are the same length
        // for each entry...
    }

    /// @notice Withdraw funds from N vesting carrots
    function withdraw(uint[] calldata _vestingCarrotIds, uint[] calldata _amounts) external {
        // TODO: modifier only owner/recipient == msg.sender
        // require amount is <= balance (even if user is owed more)
        // helper function to calculate the latest vesting
        // update the vesting variables to latest
        // require amount is <= vested amount, less previous withdrawals
        // execute the eth/ERC20 transfer
        // update balance
        // update amountWithdrawn
        // todo: what happens if an ERC20 changes its decimal from 18 to some other number? do i need to update my balances?
        // emit Withdawn event
    }
    
    /// @notice Terminate a carrot
    function terminateCarrot(uint carrotId) external {
        // TODO: implement terminate
        // consider deletion. Because zeros don’t take up any space, storage can be reclaimed by setting a value to zero. This is incentivized in smart contracts with a gas refund when you change a value to zero.
        // deletion tutorial: https://medium.com/@robhitchens/solidity-crud-part-2-ed8d8b4f74ec
        // the one-to-many doc also references it, but points to the above for implmentation. https://medium.com/robhitchens/enforcing-referential-integrity-in-ethereum-smart-contracts-a9ab1427ff42
        // TODO: emit Terminated event
    }
    
    function isFunder(address _funder) public view returns (bool) {
        if (fundersList.length == 0) return false;
        return fundersList[funders[_funder].id] == _funder;
    }
    
    function isCarrot(uint _carrotId) public view returns (bool) {
        return _carrotId < nextVestingCarrotId;
    }

    function isFunderOfCarrot(address _funder, uint _carrotId) public view returns (bool) {
        return vestingCarrots[_carrotId].funder == _funder;
    }
    
    function getFunderCount() public view returns (uint) {
        return fundersList.length;
    }   
    
    function getCarrotCount() public view returns (uint) {
        return nextVestingCarrotId;
    }
    
    /// @notice Get the number of carrots created by the funder.    
    function getCarrotCountByFunder(address _funder) public view returns (uint) {
      require(isFunder(_funder), "Not a funder");
      return funders[_funder].carrotIds.length;
    }

    // @notice Get the balance of funder ID
    function getBalance(uint _carrotId) public view returns (uint) {
        require(isCarrot(_carrotId), "Carrot does not exist");
        return vestingCarrots[_carrotId].balance;
    }

    /// @notice Get all carrots belonging to _recipient
    function getCarrotsByRecipient(address _recipient) public view returns (uint[] memory) {
        return recipientToVestingCarrotIds[_recipient];
    }
    /// @notice Get all carrots funded by _funder
    function getCarrotIdsByFunder(address _funder) public view returns (uint[] memory) {
      require(isFunder(_funder), "Not a funder");
      return funders[_funder].carrotIds;
    }

    /// @notice Get all admins of _funder
    function getAdminsByFunder(address _funder) public view returns (address[] memory) {
      require(isFunder(_funder), "Not a funder");
      return funders[_funder].admins;
    }
    
    /// @notice Get all Funders for this _admin is admin
    function getFundersByAdmin(address _admin) public view returns (address[] memory) {
        return adminFunders[_admin];
    }

    // TODO: setters to update Funder metadata (name, image, admins, etc).
    // require onlyFunder (or just msg.sender).
    // can Admins perform edits?
    // require name is not empty string
    
    // TODO: setters to update Carrot metadata
    // be cautious how does this affect balances and vesting?
}
