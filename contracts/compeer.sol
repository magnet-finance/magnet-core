// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;
// TODO: is 0.8.0 wise now that I've stopped return arrays of structs?

/**
 * @title Carrot Contract
 * @author Will Hennessy
 */
contract Carrot {
    
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
    /// @notice admins[admin][funder] = true if user is an admin for this funder.
    // mapping (address => mapping (address => bool)) public admins;


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
            adminFunders[_admins[i]].push(msg.sender);
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
        require(_startTime >= block.timestamp, "Start time is in the past");
        require(_cliffTime >= block.timestamp, "Cliff time is in the past");
        require(_endTime >= block.timestamp, "End time is in the past");
        require(_vestingPeriodLength <= (_endTime - _startTime), "Vesting Period is longer than duration");
        
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

    // @notice Deposit funds to N vesting carrots
    function deposit(uint[] calldata _vestingCarrotIds, uint[] calldata _amounts, address[] calldata _tokenIds) external payable {
        // TODO: modifier only funder
        // require all three arrays are the same length
        // for each entry, 
            // require creator is creator of this carrot
            // transfer the funds into this contract
            // add to balance. (if balance was negative, pay out immediately?)
            // create an internal-only helper function that takes 1 of each param instead of array
            // emit Deposited event (1 or N times?)
    }

    // @notice Withdraw funds from N vesting carrots
    function withdraw(uint[] calldata _vestingCarrotIds, uint[] calldata _amounts) external {
        // TODO: modifier only owner/recipient == msg.sender
        // require amount is <= balance (even if user is owed more)
        // helper function to calculate the latest vesting
        // update the vesting variables to latest
        // require amount is <= vested amount, less previous withdrawals
        // execute the eth/ERC20 transfer
        // update balance
        // update amountWithdrawn
        // emit Withdawn event
    }
    
    // @notice Terminate a carrot
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
    
    function getFunderCount() public view returns (uint) {
        return fundersList.length;
    }   
    
    function getCarrotCount() public view returns (uint) {
        return nextVestingCarrotId;
    }
    
    /// @notice Get the number of carrots created by the funder.    
    function getCarrotCount(address _funder) public view returns (uint) {
      require(isFunder(_funder), "Not a funder");
      return funders[_funder].carrotIds.length;
    }
    
    /// @notice Get all carrots created by the funder.
    function getCarrotIds(address _funder) public view returns (uint[] memory) {
      require(isFunder(_funder), "Not a funder");
      return funders[_funder].carrotIds;
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