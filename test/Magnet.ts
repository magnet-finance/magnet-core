import {ethers, waffle} from 'hardhat';
import {assert, expect, use} from 'chai';
import {utils} from 'ethers';

const IERC20 = require('../build/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json');
const zero_address = utils.getAddress('0x0000000000000000000000000000000000000000');
const {loadFixture, deployMockContract, solidity } = waffle;
use(solidity);

function getTimeInSeconds() {
  return Math.floor(new Date().getTime() / 1000)
}

/// @notice helper function to fast forward the EVM
function fastForwardEvmBy(seconds) {
  ethers.provider.send("evm_increaseTime", [seconds]);
  ethers.provider.send("evm_mine", []);
}

describe('Magnet', function() {

  async function fixtureBase() {
    const [owner, addr1] = await ethers.getSigners();
    const Magnet = await ethers.getContractFactory("Magnet");
    const magnet = await Magnet.deploy();
    await magnet.deployed();
    const mockERC20 = await deployMockContract(owner, IERC20.abi);
    return {magnet, mockERC20, owner, addr1};
  }

  async function fixtureRegisterFunder() {
    const [owner, addr1] = await ethers.getSigners();
    const Magnet = await ethers.getContractFactory("Magnet");
    const magnet = await Magnet.deploy();
    await magnet.deployed();
    const mockERC20 = await deployMockContract(owner, IERC20.abi);
    let admins = [addr1.address];
    let name = "Funder 1";
    let description = "Description 1";
    let imageUrl = "imageUrl 1";
    await magnet.registerFunder(admins, name, description, imageUrl);
    return {magnet, mockERC20, owner, addr1};
  }

  async function fixtureOneFunderAndMagnet() {
    const [owner, addr1] = await ethers.getSigners();
    const Magnet = await ethers.getContractFactory("Magnet");
    const magnet = await Magnet.deploy();
    await magnet.deployed();
    const mockERC20 = await deployMockContract(owner, IERC20.abi);
    
    let admins = [addr1.address];
    let name = "Funder 1";
    let description = "Description 1";
    let imageUrl = "imageUrl 1";
    await magnet.registerFunder(admins, name, description, imageUrl);

    let recipient = addr1.address;
    let token = mockERC20.address;
    let now = getTimeInSeconds();
    let startTime = now + 20;
    let vestingPeriodLength = 1;
    let amountPerPeriod = 1;
    let cliffTime = now + 40;
    let endTime = now + 60;
    let message = "Message 1";
    await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);

    return {magnet, mockERC20, owner, addr1};
  }

  // Positive tests: given valid input, performs as expected
  // Negative tests: given invalid input, captures errors

  describe('Deploy', function() {
    it('Contracts should be defined', async function() {
      const {magnet, mockERC20, owner, addr1} = await waffle.loadFixture(fixtureBase);
      assert.isDefined(magnet);
      assert.isDefined(mockERC20);
    });

    it('State variables initialized to zero', async function() {
      const {magnet, mockERC20, owner, addr1} = await waffle.loadFixture(fixtureBase);
      expect(await magnet.nextVestingMagnetId()).to.equal(0);
      expect(await magnet.getFunderCount()).to.equal(0);
      expect(await magnet.isFunder(owner.address)).to.be.equal(false);
      expect(await magnet.getMagnetCount()).to.equal(0);
      expect(await magnet.isMagnet(0)).to.be.equal(false);
    });
  });

  describe('Funder', function() {
    it('Register funder with valid data', async function() {
      const {magnet, mockERC20, owner, addr1} = await waffle.loadFixture(fixtureBase);
      let admins = [addr1.address];
      let name = "Funder 1";
      let description = "Description 1";
      let imageUrl = "imageUrl 1";

      let expectedId = await magnet.getFunderCount();
      await expect(magnet.registerFunder(admins, name, description, imageUrl))
        .to.emit(magnet, 'FunderRegistered')
        .withArgs(owner.address, expectedId);

      let funder = await magnet.funders(owner.address);
      expect(funder.id).to.equal(0);
      expect(funder.name).to.equal(name);
      expect(funder.funder).to.equal(owner.address);
      expect(funder.description).to.equal(description);
      expect(await magnet.getFunderCount()).to.equal(1);
      expect(await magnet.isFunder(owner.address)).to.be.equal(true);
      expect(await magnet.getMagnetIdsByFunder(owner.address)).to.eql([]);
      expect(await magnet.getAdminsByFunder(owner.address)).to.eql(admins);
      expect(await magnet.isAdmin(addr1.address, owner.address)).to.be.equal(true);
    });

    it('Reverts if sender is already registered as a funder', async function() {
      const {magnet, mockERC20, owner, addr1} = await waffle.loadFixture(fixtureBase);
      let admins = [addr1.address];
      let name = "Funder 1";
      let description = "Description 1";
      let imageUrl = "imageUrl 1";

      await magnet.registerFunder(admins, name, description, imageUrl);
      await expect(magnet.registerFunder(admins, name, description, imageUrl))
        .to.be.revertedWith('Funder already exists');    
    });

    it('Is not funder', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureBase);
      expect(await magnet.isFunder(owner.address)).to.be.equal(false);
    });

    it('Reverts if funder does not exist', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureBase);
      await expect(magnet.getMagnetCountByFunder(owner.address))
        .to.be.revertedWith('Not a funder');
      await expect(magnet.getMagnetIdsByFunder(owner.address))
        .to.be.revertedWith('Not a funder');
      await expect(magnet.getAdminsByFunder(owner.address))
        .to.be.revertedWith('Not a funder');
    });

    // TODO: add test to prevent or require funder from being in admins array
  });

  describe('VestingMagnet', function() {
    it('Revert Mint if sender has not registered as funder', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureBase);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + 20;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 40;
      let endTime = now + 60;
      let message = "Message 1";

      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Must register as funder first');
    });

    it('Mint a VestingMagnet with valid data', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + 20;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 40;
      let endTime = now + 60;
      let message = "Message 1";

      let expectedId = await magnet.getMagnetCount();
      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.emit(magnet, 'VestingMagnetMinted')
        .withArgs(recipient, owner.address, expectedId);

      let m = await magnet.vestingMagnets(expectedId);
      expect(m.recipient).to.equal(recipient);
      expect(m.token).to.equal(token);
      expect(m.funder).to.equal(owner.address);
      expect(m.id).to.equal(expectedId);
      expect(m.startTime).to.equal(startTime);
      expect(m.vestingPeriodLength).to.equal(vestingPeriodLength);
      expect(m.amountPerPeriod).to.equal(amountPerPeriod);
      expect(m.cliffTime).to.equal(cliffTime);
      expect(m.endTime).to.equal(endTime);
      expect(m.message).to.equal(message);

      expect(await magnet.isMagnet(expectedId)).to.be.equal(true);
      expect(await magnet.getMagnetCount()).to.equal(1);
      expect(await magnet.getBalance(expectedId)).to.equal(0);
      expect(await magnet.getMagnetCountByFunder(owner.address)).to.be.equal(1);
      expect((await magnet.getMagnetIdsByFunder(owner.address))[0]).to.equal(0);
      expect((await magnet.getMagnetsByRecipient(recipient))[0])
        .to.equal(expectedId);
    });

    it('Is not magnet', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      expect(await magnet.isMagnet(0)).to.be.equal(false);
    });

    it('Reverts if magnet does not exist', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      await expect(magnet.getBalance(0))
        .to.be.revertedWith('Magnet does not exist');
    });

    it('Revert if recipient is zero address', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = zero_address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + 20;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 40;
      let endTime = now + 60;
      let message = "Message 1";

      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Recipient cant be the zero address');
    });

    it('Revert if startTime is in the past', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now - 10;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 40;
      let endTime = now + 60;
      let message = "Message 1";

      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Start time is in the past');

      let zeroTime = 0;
      await expect(magnet.mintVestingMagnet(recipient, token, zeroTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Start time is in the past');
    });

    it('Revert if cliffTime is invalid', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + 20;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now - 10;
      let endTime = now + 60;
      let message = "Message 1";

      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Cliff time must be >= start time');

      let zeroTime = 0;
      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, zeroTime, endTime, message))
        .to.be.revertedWith('Cliff time must be >= start time');
    });

    it('Revert if endTime is in the past', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + 20;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 40;
      let endTime = now - 10;
      let message = "Message 1";

      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('End time must be > start time and cliff time');

      let zeroTime = 0;
      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, zeroTime, message))
        .to.be.revertedWith('End time must be > start time and cliff time');
    });

    it('Revert if vesting period is longer than duration', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + 20;
      let vestingPeriodLength = 50;
      let amountPerPeriod = 1;
      let cliffTime = now + 40;
      let endTime = now + 60;
      let message = "Message 1";

      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Period must be < duration');
    });

    it('Revert if vesting period is zero', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + 20;
      let vestingPeriodLength = 0;
      let amountPerPeriod = 1;
      let cliffTime = now + 40;
      let endTime = now + 60;
      let message = "Message 1";

      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Vesting Period must be >0');
    });

    it('Revert if amount per period is zero', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + 20;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 0;
      let cliffTime = now + 40;
      let endTime = now + 60;
      let message = "Message 1";

      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Amount must be >0');
    });

    // TODO: prevent recipient being zero address?
  });

  describe('Deposit - Vesting Magnet', function() {
    it('Deposit to a VestingMagnet with valid data', async function() {
      this.timeout(4000);
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureOneFunderAndMagnet);
      let expectedSender = owner.address;
      let expectedRecipient = magnet.address;
      let magnetId = await magnet.nextVestingMagnetId() - 1;
      let amount = 1000;
      let currentBalance = await magnet.getBalance(magnetId);
      let expectedBalance = currentBalance + amount;

      // initialize the mock contract to spoof return 'true' when transferFrom is called
      await mockERC20.mock.transferFrom.returns(true);
      await expect(magnet.deposit(magnetId, amount, mockERC20.address))
        .to.emit(magnet, 'Deposited')
        .withArgs(owner.address, magnetId, amount);
      
      // Waffle's calledOnContractWith is not currently supported by Hardhat. (1/5/2021)
      // expect("transferFrom").to.be.calledOnContractWith(mockERC20, [expectedSender, expectedRecipient, amount]);

      expect(await magnet.getBalance(magnetId)).to.equal(expectedBalance);
    });

    // TODO: add more tests for deposit()
    // try to deposit 0
    // deposit to make balance wrap - exceed int limit
    // try to deposit wrong token
    // reject a non-funder attempt to deposit
  });

  describe('Get Balances', function() {

    /// @notice helper function to calculate the vested amount, ignoring cliff
    function estimateVestedAmountIgnoringCliff(testTime, startTime, vestingPeriodLength, amountPerPeriod) {
      if (testTime < startTime) return 0;
      return (testTime - startTime) / vestingPeriodLength * amountPerPeriod;
    }

    it('Should get amount ignoring cliff, after cliff', async function() {
      this.timeout(100000);
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + 20;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 40;
      let endTime = now + 60;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      let expectedAmountAtCliff = estimateVestedAmountIgnoringCliff(cliffTime, startTime, vestingPeriodLength, amountPerPeriod);
      let expectedAmountAtEnd = estimateVestedAmountIgnoringCliff(endTime, startTime, vestingPeriodLength, amountPerPeriod);

      let amountBeforeStart = await magnet.getVestedAmountIgnoringCliff(magnetId);
      expect(amountBeforeStart).to.equal(0);
      fastForwardEvmBy(25);

      let amountBeforeCliff = await magnet.getVestedAmountIgnoringCliff(magnetId);
      console.log("amountBeforeCliff:", amountBeforeCliff.toString());
      console.log("expectedAmountAtCliff", expectedAmountAtCliff);
      expect(amountBeforeCliff).to.be.above(0)
        .and.to.be.below(expectedAmountAtCliff);
      fastForwardEvmBy(25);

      let amountBeforeEnd = await magnet.getVestedAmountIgnoringCliff(magnetId);
      console.log("amountBeforeEnd:", amountBeforeEnd.toString());
      console.log("expectedAmountAtEnd", expectedAmountAtEnd);
      expect(amountBeforeEnd).to.be.above(0)
        .and.to.be.above(expectedAmountAtCliff)
        .and.to.be.below(expectedAmountAtEnd);
      fastForwardEvmBy(15);

      let amountAfterEnd = await magnet.getVestedAmountIgnoringCliff(magnetId);
      console.log("amountAfterEnd:", amountAfterEnd.toString());
      console.log("expectedAmountAtEnd", expectedAmountAtEnd);
      expect(amountAfterEnd). to.equal(expectedAmountAtEnd);
    });

    // TODO: add more tests for withdrawal

    // 0 cliff time
    // start time == end time
    // cliff time == start time
    // cliff time == end time

    // amountOwed > balance
    // amountOwed == balance
    // amountOwed < balance
    
    // vestingPeriod Length
      // = 0
      // odd modulo of duration
      // equal to duartion
      // greater than duration

    // invalid magnet id
  });

  // describe('Admin', function() {
  //   // TODO: test isAdmins mapping, adminFunder array, helper function
  // });

});