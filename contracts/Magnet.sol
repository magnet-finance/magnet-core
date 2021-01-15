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
     * @notice vestingPeriodLength - The period of time (in seconds) between each vesting event. Set to 1 for real-time vesting.
     * @notice amountPerPeriod - The amount of token to vest to the recipient per period.
     * @notice cliffTime - Prior to this unix timestamp, tokens are vesting but not able to be withdrawn by recipient until this timestamp.
     * @notice endTime - The time at which vesting will stop. To create an indefinite vesting package, set to 2 ** 256 -1.
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
        uint endTime;
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

    modifier magnetExists(uint _id) {
        require(_id < nextVestingMagnetId, 'Magnet does not exist');
        _;
    }

    modifier funderExists(address _funder) {
        require(isFunder(_funder), 'Funder does not exist');
        _;
    }

    modifier onlyFunder(uint _vestingMagnetId, address _funder) {
        require(vestingMagnets[_vestingMagnetId].funder == _funder, 'Caller is not the funder of this magnet');
        _;
    }

    modifier onlyFunderOrRecipient(uint _vestingMagnetId, address _who) {
        VestingMagnet memory magnet = vestingMagnets[_vestingMagnetId];
        require(
            _who == vestingMagnets[_vestingMagnetId].funder || _who == vestingMagnets[_vestingMagnetId].recipient,
            'Caller is not the funder or recipient of this magnet'
        );
        _;
    }

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
    /// @dev to create a VestingMaget with indefinite end time, use _endTime = 2 ** 256 -1
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
        require(_endTime > _startTime && _endTime >= _cliffTime, "End time must be > start time and >= cliff time");
        require(_vestingPeriodLength > 0 && _vestingPeriodLength <= _endTime.sub(_startTime), "Period length must be > 0 and <= duration");
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
    function deposit(uint _vestingMagnetId, uint _amount, address _tokenId)
        public magnetExists(_vestingMagnetId) onlyFunder(_vestingMagnetId, msg.sender) returns(bool)
    {
        require(_amount > 0, "Deposit must be greater than zero");
        VestingMagnet storage magnet = vestingMagnets[_vestingMagnetId];
        require(magnet.token == _tokenId, "Deposit token address does not match magnet token");
        uint amountToFullyFundMagnet = (getLifetimeValue(_vestingMagnetId).sub(magnet.balance)).sub(magnet.amountWithdrawn);
        _amount = min(_amount, amountToFullyFundMagnet);
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

    /// @notice Withdraw funds from a VestingMagnet
    function withdraw(uint _vestingMagnetId, uint _amount)
        public magnetExists(_vestingMagnetId) onlyFunderOrRecipient(_vestingMagnetId, msg.sender) returns (bool)
    {        
        uint available = getAvailableBalance(_vestingMagnetId, msg.sender);
        _amount = min(_amount, available);
        require(_amount > 0, "Available balance is zero");

        VestingMagnet storage magnet = vestingMagnets[_vestingMagnetId];
        magnet.balance = magnet.balance.sub(_amount);
        if (msg.sender == magnet.recipient) {
            magnet.amountWithdrawn = magnet.amountWithdrawn.add(_amount);
        }

        IERC20(magnet.token).safeTransfer(msg.sender, _amount);
        emit Withdrawn(msg.sender, _vestingMagnetId, magnet.token, _amount);
    }

    /// @notice returns the amount available for withdrawal by _who
    /// @param _vestingMagnetId The ID of the VestingMagnet to withdraw from
    /// @param _who The address for which to query the balance
    function getAvailableBalance(uint _vestingMagnetId, address _who) public view magnetExists(_vestingMagnetId) returns (uint) {
        VestingMagnet memory magnet = vestingMagnets[_vestingMagnetId];
        uint amountVestedToRecipient = min(getVestedAmountOwed(_vestingMagnetId), magnet.balance);
        if (_who == magnet.recipient) return amountVestedToRecipient;
        if (_who == magnet.funder) return magnet.balance.sub(amountVestedToRecipient);
        return 0;
    }

    /// @notice returns the amount that is fully vested to the user and not yet withdrawn
    /// @dev if recipient has never withdrawn from the VestingMagnet, this is equivalent to getVestedAmount
    function getVestedAmountOwed(uint _vestingMagnetId) public view magnetExists(_vestingMagnetId) returns (uint) {
        uint amountWithdrawn = vestingMagnets[_vestingMagnetId].amountWithdrawn;
        uint vestedAmount = getVestedAmount(_vestingMagnetId);
        return vestedAmount.sub(amountWithdrawn);
    }

    /// @notice returns the amount that has vested to recipient since startTime
    /// @dev after cliffTime, this is equivalent to getVestedAmountIgnoringCliff
    function getVestedAmount(uint _vestingMagnetId) public view magnetExists(_vestingMagnetId) returns (uint) {
        if (block.timestamp < vestingMagnets[_vestingMagnetId].cliffTime) {
            return 0;
        }
        return getVestedAmountIgnoringCliff(_vestingMagnetId);
    }

    /// @notice returns the progress made toward vesting since startTime, if the cliff is ignored
    function getVestedAmountIgnoringCliff(uint _vestingMagnetId) public view magnetExists(_vestingMagnetId) returns (uint) {
        VestingMagnet memory magnet = vestingMagnets[_vestingMagnetId];
        if (block.timestamp <= magnet.startTime) return 0;
        uint time = min(block.timestamp, magnet.endTime);
        uint timeElapsed = time.sub(magnet.startTime);
        uint numPeriodsElapsed = timeElapsed.div(magnet.vestingPeriodLength);
        return numPeriodsElapsed.mul(magnet.amountPerPeriod);
    }

    /// @notice returns the lifetime value of a VestingMagnet
    function getLifetimeValue(uint _vestingMagnetId) public view magnetExists(_vestingMagnetId) returns (uint) {
        VestingMagnet memory magnet = vestingMagnets[_vestingMagnetId];
        uint duration = magnet.endTime.sub(magnet.startTime);
        uint numPeriods = duration.div(magnet.vestingPeriodLength);
        return numPeriods.mul(magnet.amountPerPeriod);
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
        return fundersList.length > 0 && fundersList[funders[_funder].id] == _funder;
    }
        
    function getFunderCount() public view returns (uint) {
        return fundersList.length;
    }   
    
    function getMagnetCount() public view returns (uint) {
        return nextVestingMagnetId;
    }

    /// @notice Get the number of magnets created by the funder.    
    function getMagnetCountByFunder(address _funder) public view funderExists(_funder) returns (uint) {
      return funders[_funder].magnetIds.length;
    }

    /// @notice Get all magnets belonging to _recipient
    function getMagnetsByRecipient(address _recipient) public view returns (uint[] memory) {
        return recipientToVestingMagnetIds[_recipient];
    }
    /// @notice Get all magnets funded by _funder
    function getMagnetIdsByFunder(address _funder) public view funderExists(_funder) returns (uint[] memory) {
      return funders[_funder].magnetIds;
    }

    /// @notice Get all admins of _funder
    function getAdminsByFunder(address _funder) public view funderExists(_funder) returns (address[] memory) {
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

    // TODO: setters to update Funder metadata (name, image, admins, etc).
    // require onlyFunder. can Admins perform edits?
    
    // TODO: setters to update Magnet metadata
    // require onlyFunder or onlyAdmin
    // be cautious how does this affect balances and vesting?
}
