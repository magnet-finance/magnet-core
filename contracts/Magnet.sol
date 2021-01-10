// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.6.12;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/**
 * @title Magnet Contract
 * @author Will Hennessy
 */
contract Magnet {
        using SafeERC20 for IERC20;
        using SafeMath for uint;
    
    /// @dev Contract design follows the one-to-many model with one Funder related to many VestingMagnets
    /// https://medium.com/robhitchens/enforcing-referential-integrity-in-ethereum-smart-contracts-a9ab1427ff42
    
    /// @notice Record details for a Funder. 
    /// @dev This could be a DAO multisig, an individual, or an organization.
    /// @notice id - Internal ID of the funder
    /// @notice magnetIds - IDs of all the VestingMagnets funded by this funder.
    /// @notice funder - The wallet address who created this VestingMagnet and funds it. Only the funder can deposit funds into the VestingMagnet.
    /// @notice admins - List of addresses with admin power to execute non-monetary write transactions such as create, modify, and propose deposit.
    struct Funder {
        uint id; // TODO // supports the delete function
        uint[] magnetIds;
        address funder;
        address[] admins; // TODO: look into OpenZeppelin for the most secure way of handling admins.
        string name;
        string description;
        string imageUrl;
    }

    /// @notice The Funder record corresponding to each address.
    mapping (address => Funder) public funders;
    /// @notice List of all funders who are registered.
    address[] public fundersList;

    /**
     * @notice Record details for a Vesting Magnet
     * @notice funder - The address of the funder who created and deposits to this magnet.
     * @notice startTime - The unix time at which vesting begins.
     * @notice vestingPeriodLength - The period of time (in seconds) between each vesting event. Set to 0 for real-time vesting.
     * @notice amountPerPeriod - The amount of token to vest to the recipient per period.
     * @notice cliffTime - Prior to this unix timestamp, tokens are vesting but not able to be withdrawn by recipient until this timestamp.
     * @notice endTime - The time at which vesting will stop.
     * @notice amountWithdrawn - Cumulative amount of token that has been withrawn by recipient since startTime.
     * @notice balance - Current balance of token deposited by the Funder and allocated to this Magnet. Some portion of these funds may have vested already, but not yet withdrawn.
     * @notice message - Optional message for the Funder to use. For example, to explain the purpose of this vesting package.
     */
    struct VestingMagnet {
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
        uint balance;
        string message;
    }

    /// @notice List of all VestingMagnets ordered by ID
    mapping (uint => VestingMagnet) public vestingMagnets;
    uint public nextVestingMagnetId;

    /// @notice List of all VestingMagnets owned by a given address
    mapping (address => uint[]) public recipientToVestingMagnetIds;

    /// @notice adminFunders[admin] returns list of all Funders for whom admin is admin.
    mapping (address => address[]) public adminFunders;
    /// TODO: don't think I need the above mapping

    /// @notice isAdmin[admin][funder] = true if admin is an admin for this funder.
    mapping (address => mapping (address => bool)) public isAdmin;


    /// @notice An event thats emitted when a new Funder is registered
    event FunderRegistered(address indexed funder, uint indexed vestingMagnetId);
    
    /// @notice An event thats emitted when a new VestingMagnet is minted
    event VestingMagnetMinted(address indexed recipient, address indexed funder, uint indexed vestingMagnetId);

    /// @notice An event thats emitted when funds are deposited into the contract
    event Deposited(address indexed from, uint indexed vestingMagnetId, uint amount);
    // TODO: emit token address too, not indexed. update unit test.

    /// @notice An event thats emitted when funds are withdrawn from the contract
    event Withdrawn(address indexed to, uint indexed vestingMagnetId, address token, uint amount);

    // TODO: event FunderDeleted  (remember to only allow if zero magnets)
    // TODO: event VestingMagnetTerminated

    // TODO: event FunderUpdated
    // TODO: event MagnetUpdated
    
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
        // f.magnetIds is already init to an empty array.
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

    /// @notice Mint a new VestingMagnet with 0 balance.
    function mintVestingMagnet(
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
        
        vestingMagnets[nextVestingMagnetId] = VestingMagnet({
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
        
        funders[msg.sender].magnetIds.push(nextVestingMagnetId);
        recipientToVestingMagnetIds[_recipient].push(nextVestingMagnetId);
        emit VestingMagnetMinted(_recipient, msg.sender, nextVestingMagnetId);
        nextVestingMagnetId++;
        return nextVestingMagnetId-1;
    }

    /// @notice Deposit to a VestingMagnet
    function deposit(uint _vestingMagnetId, uint _amount, address _tokenId) public returns(bool) {
        require(isMagnet(_vestingMagnetId), "Magnet does not exist");
        require(isFunderOfMagnet(msg.sender, _vestingMagnetId), "Only the funder can deposit to a magnet");
        require(_amount > 0, "amount is zero");

        VestingMagnet storage magnet = vestingMagnets[_vestingMagnetId];
        require(magnet.token == _tokenId, "Deposit token address does not match magnet token");
        magnet.balance = magnet.balance.add(_amount);

        IERC20(_tokenId).safeTransferFrom(msg.sender, address(this), _amount);
        emit Deposited(msg.sender, _vestingMagnetId, _amount);
        return true;
    }

    /// @notice Deposit funds to multiple VestingMagnets in a single transaction
    function depositMany(uint[] calldata _vestingMagnetIds, uint[] calldata _amounts, address[] calldata _tokenIds) external {
        // TODO
        // require all three arrays are the same length
        // for each entry...
    }

    /// @notice Withdraw funds from a VestingMagnet. Called by recipient of the VestingMagnet.
    function withdraw(uint _vestingMagnetId, uint _amount) public returns(bool) {
        require(isMagnet(_vestingMagnetId), "Magnet does not exist");
        VestingMagnet memory magnet = vestingMagnets[_vestingMagnetId];
        require(block.timestamp >= magnet.cliffTime, "Withdrawal not permitted until cliff is reached");
        require(msg.sender == magnet.recipient);

        uint available = getAvailableBalance(_vestingMagnetId);
        _amount = min(_amount, available);

        magnet.balance = magnet.balance.sub(_amount);
        magnet.amountWithdrawn = magnet.amountWithdrawn.add(_amount);

        IERC20(magnet.token).safeTransfer(msg.sender, _amount);
        emit Withdrawn(msg.sender, _vestingMagnetId, magnet.token, _amount);
    }

    /// @notice returns the amount available for withdrawal
    /// @dev considers time elapsed since startTime and amount vested per period
    /// @dev if the funder  may return 0 even if recipient is owed money in the event that funder balance is 0
    function getAvailableBalance(uint _vestingMagnetId) public view returns (uint) {
        return min(getVestedAmountOwed(_vestingMagnetId), vestingMagnets[_vestingMagnetId].balance);
    }

    /// @notice returns the amount that is fully vested to the user and not yet withdrawn
    /// @dev if recipient has never withdrawn from the VestingMagnet, this is equivalent to getVestedAmount
    function getVestedAmountOwed(uint _vestingMagnetId) public view returns (uint) {
        uint amountWithdrawn = vestingMagnets[_vestingMagnetId].amountWithdrawn;
        uint vestedAmount = getVestedAmount(_vestingMagnetId);
        return vestedAmount.sub(amountWithdrawn);
    }

    /// @notice returns the amount that has vested to the user since startTime
    /// @dev after cliffTime, this is equivalent to getVestedAmountIgnoringCliff
    function getVestedAmount(uint _vestingMagnetId) public view returns (uint) {
        if (block.timestamp < vestingMagnets[_vestingMagnetId].cliffTime) {
            return 0;
        }
        return getVestedAmountIgnoringCliff(_vestingMagnetId);
    }

    /// @notice returns the amount that would be vested to the user since startTime, if cliffTime were ignored
    /// @dev ignores cliffTime, amountWithdrawn, and balance
    function getVestedAmountIgnoringCliff(uint _vestingMagnetId) public view returns (uint) {
        console.log("block.timestamp: ", block.timestamp);
        VestingMagnet memory magnet = vestingMagnets[_vestingMagnetId];
        if (block.timestamp <= magnet.startTime) return 0;
        uint time = min(block.timestamp, magnet.endTime);
        uint timeElapsed = time.sub(magnet.startTime);
        uint numPeriodsElapsed = timeElapsed.div(magnet.vestingPeriodLength);
        return numPeriodsElapsed.mul(magnet.amountPerPeriod);
    }

    /// @notice Withdraw funds from N vesting magnets
    function withdrawMany(uint[] calldata _vestingMagnetIds, uint[] calldata _amounts) external {
        // TODO
    }
    
    /// @notice Terminate a magnet
    function terminateMagnet(uint _vestingMagnetId) external {
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
    
    function isMagnet(uint _vestingMagnetId) public view returns (bool) {
        return _vestingMagnetId < nextVestingMagnetId;
    }

    function isFunderOfMagnet(address _funder, uint _vestingMagnetId) public view returns (bool) {
        return vestingMagnets[_vestingMagnetId].funder == _funder;
    }
    
    function getFunderCount() public view returns (uint) {
        return fundersList.length;
    }   
    
    function getMagnetCount() public view returns (uint) {
        return nextVestingMagnetId;
    }

    function getFunderOfMagnet(uint _vestingMagnetId) public view returns (address) {
        require(isMagnet(_vestingMagnetId), "Magnet does not exist");
        return vestingMagnets[_vestingMagnetId].funder;
    }
    
    /// @notice Get the number of magnets created by the funder.    
    function getMagnetCountByFunder(address _funder) public view returns (uint) {
      require(isFunder(_funder), "Not a funder");
      return funders[_funder].magnetIds.length;
    }

    /// @notice Get the balance of funder ID
    function getBalance(uint _vestingMagnetId) public view returns (uint) {
        require(isMagnet(_vestingMagnetId), "Magnet does not exist");
        return vestingMagnets[_vestingMagnetId].balance;
    }

    /// @notice Get all magnets belonging to _recipient
    function getMagnetsByRecipient(address _recipient) public view returns (uint[] memory) {
        return recipientToVestingMagnetIds[_recipient];
    }
    /// @notice Get all magnets funded by _funder
    function getMagnetIdsByFunder(address _funder) public view returns (uint[] memory) {
      require(isFunder(_funder), "Not a funder");
      return funders[_funder].magnetIds;
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

    /// @notice returns the minimum of a or b
    function min(uint a, uint b) internal pure returns (uint) {
		return a < b ? a : b;
	}

    // TODO: add modifiers to functions
    /// recipientOnly, funderOnly, adminOnly, isMagnet, isFunder

    // TODO: setters to update Funder metadata (name, image, admins, etc).
    // require onlyFunder (or just msg.sender).
    // can Admins perform edits?
    // require name is not empty string
    
    // TODO: setters to update Magnet metadata
    // be cautious how does this affect balances and vesting?
}
