import { ethers, waffle } from 'hardhat';
import { assert, expect, use } from 'chai';
import { BigNumber, utils } from 'ethers';

import { Magnet } from "../build/typechain/Magnet";
import { Magnet__factory } from "../build/typechain/factories/Magnet__factory";

const IERC20 = require('../build/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json');
const {loadFixture, deployMockContract, solidity } = waffle;
use(solidity);

const zero_address = utils.getAddress('0x0000000000000000000000000000000000000000');
const START_TIME_DELTA = 20;
const CLIFF_TIME_DELTA = 864000 + START_TIME_DELTA; // 10 days after start time
const END_TIME_DELTA = 3456000 + START_TIME_DELTA; // 40 days after start time

const LONG_START_TIME_DELTA = 120;
const LONG_CLIFF_TIME_DELTA = 864000 + LONG_START_TIME_DELTA; // 10 days after start time
const LONG_END_TIME_DELTA = 3456000 + LONG_START_TIME_DELTA; // 40 days after start time


function getTimeInSeconds() {
  return Math.floor(new Date().getTime() / 1000)
}

/// @notice helper function to fast forward the EVM
function fastForwardEvmBy(seconds: number) {
  ethers.provider.send("evm_increaseTime", [seconds]);
  ethers.provider.send("evm_mine", []);
}

/// @notice helper function to calculate the vested amount, ignoring cliff
function estimateVestedAmountIgnoringCliff(atTime: number | BigNumber, startTime: number | BigNumber,
  vestingPeriodLength: number | BigNumber, amountPerPeriod: number | BigNumber) : BigNumber
{
  if (typeof(atTime) == "number") atTime = BigNumber.from(atTime);
  if (typeof(startTime) == "number") startTime = BigNumber.from(startTime);
  if (typeof(vestingPeriodLength) == "number") vestingPeriodLength = BigNumber.from(vestingPeriodLength);
  if (typeof(amountPerPeriod) == "number") amountPerPeriod = BigNumber.from(amountPerPeriod);
  if (atTime.lte(startTime)) return BigNumber.from(0);
  return ((atTime.sub(startTime)).div(vestingPeriodLength)).mul(amountPerPeriod);
}

describe('Magnet', function() {

  async function fixtureBase() {
    const [owner, addr1] = await ethers.getSigners();
    const Magnet = await ethers.getContractFactory("Magnet") as Magnet__factory;
    const magnet = await Magnet.deploy() as Magnet;
    await magnet.deployed();

    // initialize mockERC20 contract and spoof return value of 'true'
    const mockERC20 = await deployMockContract(owner, IERC20.abi);
    await mockERC20.mock.transfer.returns(true);
    await mockERC20.mock.transferFrom.returns(true);
    return {magnet, mockERC20, owner, addr1};
  }

  async function fixtureRegisterFunder() {
    const [owner, addr1] = await ethers.getSigners();
    const Magnet = await ethers.getContractFactory("Magnet") as Magnet__factory;
    const magnet = await Magnet.deploy() as Magnet;
    await magnet.deployed();

    // initialize mockERC20 contract and spoof return value of 'true'
    const mockERC20 = await deployMockContract(owner, IERC20.abi);
    await mockERC20.mock.transfer.returns(true);
    await mockERC20.mock.transferFrom.returns(true);

    let admins = [addr1.address];
    let name = "Funder 1";
    let description = "Description 1";
    let imageUrl = "imageUrl 1";
    await magnet.registerFunder(admins, name, description, imageUrl);
    return {magnet, mockERC20, owner, addr1};
  }

  async function fixtureOneMagnetOneFunder() {
    const [owner, addr1] = await ethers.getSigners();
    const Magnet = await ethers.getContractFactory("Magnet") as Magnet__factory;
    const magnet = await Magnet.deploy() as Magnet;
    await magnet.deployed();
    
    // initialize mockERC20 contract and spoof return value of 'true'
    const mockERC20 = await deployMockContract(owner, IERC20.abi);
    await mockERC20.mock.transfer.returns(true);
    await mockERC20.mock.transferFrom.returns(true);
    
    let admins = [addr1.address];
    let name = "Funder 1";
    let description = "Description 1";
    let imageUrl = "imageUrl 1";
    await magnet.registerFunder(admins, name, description, imageUrl);

    let recipient = addr1.address;
    let token = mockERC20.address;
    let now = getTimeInSeconds();
    let startTime = now + START_TIME_DELTA;
    let vestingPeriodLength = 1;
    let amountPerPeriod = 1;
    let cliffTime = now + CLIFF_TIME_DELTA;
    let endTime = now + END_TIME_DELTA;
    let message = "Message 1";
    await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);

    return {magnet, mockERC20, owner, addr1};
  }

  async function fixtureManyMagnetOneFunder() {
    const addrs = await ethers.getSigners();
    const owner = addrs[0];
    const Magnet = await ethers.getContractFactory("Magnet") as Magnet__factory;
    const magnet = await Magnet.deploy() as Magnet;
    await magnet.deployed();
    
    // initialize many different mockERC20 tokens
    const tokens = [];
    let numTokens = 3;
    var i;
    for (i = 0; i < numTokens; i++) {
      tokens[i] = await deployMockContract(owner, IERC20.abi);
      await tokens[i].mock.transfer.returns(true);
      await tokens[i].mock.transferFrom.returns(true);
    }

    let admins: string[] = [];
    let name = "Funder 1";
    let description = "Description 1";
    let imageUrl = "imageUrl 1";
    await magnet.registerFunder(admins, name, description, imageUrl);

    // mint one magnet for every recipient:token pair, excluding owner
    let magnetIds = [];
    let magnetRecipients = [];
    let magnetTokens = [];
    let numRecipients = 10;
    var rec, tok, id = 0;
    for (rec = 1; rec < numRecipients+1; rec++) {
      let recipient = addrs[rec].address;
      for (tok = 0; tok < numTokens; tok++) {
        let token = tokens[tok].address;
        let now = getTimeInSeconds();
        let startTime = now + LONG_START_TIME_DELTA;
        let vestingPeriodLength = 1;
        let amountPerPeriod = 1;
        let cliffTime = now + LONG_CLIFF_TIME_DELTA;
        let endTime = now + LONG_END_TIME_DELTA;
        let message = "Message" + rec + tok;
        await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
        magnetIds.push(id);
        id++;
        magnetRecipients.push(recipient);
        magnetTokens.push(token);
      }
    }

    return {magnet, tokens, addrs, magnetIds, magnetRecipients, magnetTokens};
  }

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
      expect(funder.funder).to.equal(owner.address);
      expect(funder.name).to.equal(name);
      expect(funder.description).to.equal(description);
      expect(funder.imageUrl).to.equal(imageUrl);
      expect(await magnet.getFunderCount()).to.equal(1);
      expect(await magnet.isFunder(owner.address)).to.be.equal(true);
      expect(await magnet.getMagnetIdsByFunder(owner.address)).to.eql([]);
      expect(await magnet.getAdminsByFunder(owner.address)).to.eql(admins);
      expect(await magnet.isAdmin(addr1.address, owner.address)).to.be.equal(true);
    });

    it('Register reverts if sender is already registered as a funder', async function() {
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

    it('Register reverts if funder does not exist', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureBase);
      await expect(magnet.getMagnetCountByFunder(owner.address))
        .to.be.revertedWith('Funder does not exist');
      await expect(magnet.getMagnetIdsByFunder(owner.address))
        .to.be.revertedWith('Funder does not exist');
      await expect(magnet.getAdminsByFunder(owner.address))
        .to.be.revertedWith('Funder does not exist');
    });

    it('Update funder with valid data', async function() {
      const {magnet, mockERC20, owner, addr1} = await waffle.loadFixture(fixtureBase);
      let admins = [addr1.address];
      let name = "Funder 1";
      let description = "Description 1";
      let imageUrl = "imageUrl 1";
      await magnet.registerFunder(admins, name, description, imageUrl);
      let originalFunder = await magnet.funders(owner.address);
      let originalAdmins = await magnet.getAdminsByFunder(owner.address);

      const [ , , other] = await ethers.getSigners();
      let adminsToAppend = [other.address];
      let updateName = "Funder updated";
      let updateDescription = "Description updated";
      let updateImageUrl = "imageUrl updated";

      await expect(magnet.updateFunder(adminsToAppend, updateName, updateDescription, updateImageUrl))
        .to.emit(magnet, 'FunderUpdated')
        .withArgs(owner.address, originalFunder.id);

      let updatedFunder = await magnet.funders(owner.address);
      expect(updatedFunder.id).to.equal(originalFunder.id);
      expect(updatedFunder.funder).to.equal(originalFunder.funder);
      expect(updatedFunder.name).to.equal(updateName);
      expect(updatedFunder.description).to.equal(updateDescription);
      expect(updatedFunder.imageUrl).to.equal(updateImageUrl);
      expect(await magnet.isFunder(owner.address)).to.be.equal(true);
      expect(await magnet.getMagnetIdsByFunder(owner.address)).to.eql([]);
      expect(await magnet.getAdminsByFunder(owner.address)).to.eql(originalAdmins.concat(adminsToAppend));
      expect(await magnet.isAdmin(addr1.address, owner.address)).to.be.equal(true);
      expect(await magnet.isAdmin(other.address, owner.address)).to.be.equal(true);
    });

    it('Update reverts if sender is not registered as a funder', async function() {
      const {magnet, mockERC20, owner, addr1} = await waffle.loadFixture(fixtureBase);
      let adminsToAppend = [addr1.address];
      let name = "Funder 1";
      let description = "Description 1";
      let imageUrl = "imageUrl 1";

      await expect(magnet.updateFunder(adminsToAppend, name, description, imageUrl))
        .to.be.revertedWith('Must register as funder first');    
    });

  });

  describe('VestingMagnet', function() {
    it('Mint a VestingMagnet as un-registered funder with valid data', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureBase);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
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
      expect(m.balance).to.equal(0);

      let funder = await magnet.funders(owner.address);
      expect(funder.id).to.equal(0);
      expect(funder.funder).to.equal(owner.address);
      expect(funder.name).to.equal("");
      expect(funder.description).to.equal("");
      expect(funder.imageUrl).to.equal("");
      expect(await magnet.getFunderCount()).to.equal(1);
      expect(await magnet.isFunder(owner.address)).to.be.equal(true);
      expect(await magnet.getAdminsByFunder(owner.address)).to.eql([]);

      expect(await magnet.getMagnetCount()).to.equal(1);
      expect(await magnet.getMagnetCountByFunder(owner.address)).to.be.equal(1);
      expect((await magnet.getMagnetIdsByFunder(owner.address))[0]).to.equal(0);
      expect((await magnet.getMagnetsByRecipient(recipient))[0])
        .to.equal(expectedId);
    });

    it('Mint a VestingMagnet as registered funder with valid data', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
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
      expect(m.balance).to.equal(0);

      expect(await magnet.getMagnetCount()).to.equal(1);
      expect(await magnet.getMagnetCountByFunder(owner.address)).to.be.equal(1);
      expect((await magnet.getMagnetIdsByFunder(owner.address))[0]).to.equal(0);
      expect((await magnet.getMagnetsByRecipient(recipient))[0])
        .to.equal(expectedId);
    });

    it('Mint increments nextVestingMagnetId correctly', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";

      let expectedId = 0;
      for (expectedId = 0; expectedId < 5; expectedId++) {
        await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
          .to.emit(magnet, 'VestingMagnetMinted')
          .withArgs(recipient, owner.address, expectedId);
        expect((await magnet.vestingMagnets(expectedId)).id).to.equal(expectedId);
      }
    });

    it('Revert if recipient is zero address', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = zero_address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
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
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";

      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Start time is in the past');

      let zeroTime = 0;
      await expect(magnet.mintVestingMagnet(recipient, token, zeroTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Start time is in the past');
    });

    it('Revert if cliffTime is in the past', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now - 10;
      let endTime = now + END_TIME_DELTA;
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
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now - 10;
      let message = "Message 1";

      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('End time must be > start time and >= cliff time');

      let zeroTime = 0;
      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, zeroTime, message))
        .to.be.revertedWith('End time must be > start time and >= cliff time');
    });

    it('Revert if vesting period is longer than duration', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = (END_TIME_DELTA - START_TIME_DELTA) + 10;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";

      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Period length must be > 0 and <= duration');
    });

    it('Revert if vesting period is zero', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 0;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";

      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Period length must be > 0 and <= duration');
    });

    it('Revert if amount per period is zero', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 0;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";

      await expect(magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Amount must be >0');
    });
  });

  describe('Deposit', function() {
    it('Deposit to a VestingMagnet with valid data', async function() {
      this.timeout(4000);
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureOneMagnetOneFunder);
      let expectedSender = owner.address;
      let expectedRecipient = magnet.address;
      let magnetId = (await magnet.nextVestingMagnetId()).sub(1);
      let amount = 1000;
      let currentBalance = (await magnet.vestingMagnets(magnetId)).balance;
      let expectedBalance = currentBalance.add(amount);

      await expect(magnet.deposit(magnetId, amount, mockERC20.address))
        .to.emit(magnet, 'Deposited')
        .withArgs(owner.address, magnetId, mockERC20.address, amount);
      
      // Waffle's calledOnContractWith is not currently supported by Hardhat. (1/5/2021)
      // expect("transferFrom").to.be.calledOnContractWith(mockERC20, [expectedSender, expectedRecipient, amount]);

      expect((await magnet.vestingMagnets(magnetId)).balance).to.equal(expectedBalance);
    });

    it('Should revert if magnet does not exist', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureOneMagnetOneFunder);
      let magnetId = (await magnet.nextVestingMagnetId()).add(1);
      let amount = 0;

      await expect(magnet.deposit(magnetId, amount, mockERC20.address))
        .to.be.revertedWith('Magnet does not exist');
    });

    it('Should revert if depositing 0', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureOneMagnetOneFunder);
      let magnetId = (await magnet.nextVestingMagnetId()).sub(1);
      let amount = 0;

      await expect(magnet.deposit(magnetId, amount, mockERC20.address))
        .to.be.revertedWith('Deposit amount is zero or magnet is already funded to lifetime value');
    });

    it('Should revert if depositing a different token', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureOneMagnetOneFunder);
      let magnetId = (await magnet.nextVestingMagnetId()).sub(1);
      let amount = 1000;
      let wrongToken = await deployMockContract(owner, IERC20.abi);

      await expect(magnet.deposit(magnetId, amount, wrongToken.address))
        .to.be.revertedWith('Deposit token address does not match magnet token');
    });

    it('Should revert if non-funder tries to deposit', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureOneMagnetOneFunder);
      let magnetId = (await magnet.nextVestingMagnetId()).sub(1);
      let amount = 1000;

      await expect(magnet.connect(addr1).deposit(magnetId, amount, mockERC20.address))
        .to.be.revertedWith('Caller is not the funder of this magnet');
    });

    it('Should only allow deposits up to total lifetime value of a finite VestingMagnet', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureOneMagnetOneFunder);
      let magnetId = (await magnet.nextVestingMagnetId()).sub(1);
      let amount = ethers.constants.MaxUint256;
      let totalLifetimeValue = END_TIME_DELTA - START_TIME_DELTA;

      await expect(magnet.deposit(magnetId, amount, mockERC20.address))
        .to.emit(magnet, 'Deposited')
        .withArgs(owner.address, magnetId, mockERC20.address, totalLifetimeValue);
      expect((await magnet.vestingMagnets(magnetId)).balance).to.equal(totalLifetimeValue);
    });

    it('Should only top up to the total lifetime value of a finite VestingMagnet', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureOneMagnetOneFunder);
      let magnetId = (await magnet.nextVestingMagnetId()).sub(1);
      let totalLifetimeValue = END_TIME_DELTA - START_TIME_DELTA;

      let amount1 = totalLifetimeValue / 2;
      await expect(magnet.deposit(magnetId, amount1, mockERC20.address))
        .to.emit(magnet, 'Deposited')
        .withArgs(owner.address, magnetId, mockERC20.address, amount1);
      expect((await magnet.vestingMagnets(magnetId)).balance).to.equal(amount1);

      let amount2 = totalLifetimeValue;
      await expect(magnet.deposit(magnetId, amount2, mockERC20.address))
        .to.emit(magnet, 'Deposited')
        .withArgs(owner.address, magnetId, mockERC20.address, totalLifetimeValue - amount1);
      expect((await magnet.vestingMagnets(magnetId)).balance).to.equal(totalLifetimeValue);
    });
  });

  describe('Deposit Many', function() {
    it('Many magnets fixture works', async function() {
      const {magnet, tokens, addrs, magnetIds, magnetRecipients, magnetTokens} = await loadFixture(fixtureManyMagnetOneFunder);
      const owner = addrs[0];

      let numMagnets = await magnet.getMagnetCount();
      expect(numMagnets).to.equal(magnetRecipients.length);
      expect(await magnet.getMagnetCountByFunder(owner.address)).to.be.equal(numMagnets);

      let id;
      for (id in magnetIds) {
        let m = await magnet.vestingMagnets(id);
        expect(m.id).to.equal(id);
        expect(m.recipient).to.equal(magnetRecipients[id]);
        expect(m.token).to.equal(magnetTokens[id]);
        expect(m.funder).to.equal(owner.address);
        expect(m.balance).to.equal(0);
      }
    });

    it('Should depositMany with valid data: 3 tokens, 10 recipients', async function() {
      const {magnet, tokens, addrs, magnetIds, magnetRecipients, magnetTokens} = await loadFixture(fixtureManyMagnetOneFunder);
      const owner = addrs[0];

      let amountToDeposit = 1000;
      let amountsToDeposit = Array(magnetIds.length).fill(amountToDeposit);
      let startingBalance = 0;
      let expectedBalance = startingBalance + amountToDeposit;
      let pendingEvents = expect(magnet.depositMany(magnetIds, amountsToDeposit, magnetTokens))
        .to.emit(magnet, 'Deposited');
      
      let i;
      for (i = 0; i < magnetIds.length; i++) {
        await pendingEvents.withArgs(owner.address, magnetIds[i], magnetTokens[i], amountsToDeposit[i]);
        expect((await magnet.vestingMagnets(i)).balance).to.equal(expectedBalance);
      }
    });

    it('Should depositMany with valid data: 1 token, 10 recipients', async function() {
      const {magnet, tokens, addrs, magnetIds, magnetRecipients, magnetTokens} = await loadFixture(fixtureManyMagnetOneFunder);
      const owner = addrs[0];

      // deposit only to magnets denominated in this token
      let targetToken = magnetTokens[0];
      let magnetIdsToDeposit = [];
      let amountsToDeposit = [];
      let tokensToDeposit = [];
      let amountToDeposit = 1000;
      let startingBalance = 0;
      let expectedBalance = startingBalance + amountToDeposit;

      let i;
      for (i = 0; i < magnetIds.length; i++) {
        if (magnetTokens[i] === targetToken) {
          magnetIdsToDeposit.push(magnetIds[i]);
          amountsToDeposit.push(amountToDeposit);
          tokensToDeposit.push(targetToken);
        }
      }

      let pendingEvents = expect(magnet.depositMany(magnetIdsToDeposit, amountsToDeposit, tokensToDeposit))
        .to.emit(magnet, 'Deposited');
      
      for (i = 0; i < magnetIdsToDeposit.length; i++) {
        await pendingEvents.withArgs(owner.address, magnetIdsToDeposit[i], tokensToDeposit[i], amountsToDeposit[i]);
        expect((await magnet.vestingMagnets(magnetIdsToDeposit[i])).balance).to.equal(expectedBalance);
      }
    });

    it('Should only allow deposits up to total lifetime value of a finite VestingMagnet', async function() {
      const {magnet, tokens, addrs, magnetIds, magnetRecipients, magnetTokens} = await loadFixture(fixtureManyMagnetOneFunder);
      const owner = addrs[0];

      let amountToDeposit = 1000;
      let amountsToDeposit = Array(magnetIds.length).fill(amountToDeposit);
      let totalLifetimeValue = LONG_END_TIME_DELTA - LONG_START_TIME_DELTA;
      let magnetIdToMaxOut = magnetIds.length / 2;
      amountsToDeposit[magnetIdToMaxOut] = ethers.constants.MaxUint256;

      let startingBalance = 0;
      let expectedBalance = startingBalance + amountToDeposit;
      let pendingEvents = expect(magnet.depositMany(magnetIds, amountsToDeposit, magnetTokens))
        .to.emit(magnet, 'Deposited');
      
      let i;
      for (i = 0; i < magnetIds.length; i++) {
        if (magnetIds[i] == magnetIdToMaxOut) {
          await pendingEvents.withArgs(owner.address, magnetIds[i], magnetTokens[i], totalLifetimeValue);
          expect((await magnet.vestingMagnets(i)).balance).to.equal(totalLifetimeValue);  
        } else {
          await pendingEvents.withArgs(owner.address, magnetIds[i], magnetTokens[i], amountsToDeposit[i]);
          expect((await magnet.vestingMagnets(i)).balance).to.equal(expectedBalance);  
        }
      }
    });

    it('Should revert if any amount is 0', async function() {
      const {magnet, tokens, addrs, magnetIds, magnetRecipients, magnetTokens} = await loadFixture(fixtureManyMagnetOneFunder);

      let amountToDeposit = 1000;
      let amountsToDeposit = Array(magnetIds.length).fill(amountToDeposit);
      let magnetIdToZeroOut = magnetIds.length / 2;
      amountsToDeposit[magnetIdToZeroOut] = 0;
      
      await expect(magnet.depositMany(magnetIds, amountsToDeposit, magnetTokens))
        .to.be.revertedWith('Deposit amount is zero or magnet is already funded to lifetime value');
    });

    it('Should revert when array lengths do not match', async function() {
      const {magnet, tokens, addrs, magnetIds, magnetRecipients, magnetTokens} = await loadFixture(fixtureManyMagnetOneFunder);

      let amountToDeposit = 1000;
      let amountsToDeposit = Array(magnetIds.length).fill(amountToDeposit);

      let shortMagnetIds = magnetIds.slice(0, magnetIds.length - 1);
      await expect(magnet.depositMany(shortMagnetIds, amountsToDeposit, magnetTokens))
        .to.be.revertedWith('Input arrays must be same length');

      let shortAmounts = Array(magnetIds.length - 1).fill(amountToDeposit);
      await expect(magnet.depositMany(magnetIds, shortAmounts, magnetTokens))
        .to.be.revertedWith('Input arrays must be same length');

      let shortTokens = magnetTokens.slice(0, magnetTokens.length - 1);
      await expect(magnet.depositMany(magnetIds, amountsToDeposit, shortTokens))
        .to.be.revertedWith('Input arrays must be same length');
  
      await expect(magnet.depositMany(shortMagnetIds, shortAmounts, magnetTokens))
        .to.be.revertedWith('Input arrays must be same length');

      await expect(magnet.depositMany(magnetIds, shortAmounts, shortTokens))
        .to.be.revertedWith('Input arrays must be same length');
    });

    it('Should revert when array lengths are zero', async function() {
      const {magnet, tokens, addrs, magnetIds, magnetRecipients, magnetTokens} = await loadFixture(fixtureManyMagnetOneFunder);

      let amountToDeposit = 1000;
      let amountsToDeposit = Array(magnetIds.length).fill(amountToDeposit);

      await expect(magnet.depositMany([], amountsToDeposit, magnetTokens))
        .to.be.revertedWith('Input arrays must be same length');

      await expect(magnet.depositMany(magnetIds, [], magnetTokens))
        .to.be.revertedWith('Input arrays must be same length');

      await expect(magnet.depositMany(magnetIds, amountsToDeposit, []))
        .to.be.revertedWith('Input arrays must be same length');
  
      await expect(magnet.depositMany([], [], magnetTokens))
        .to.be.revertedWith('Input arrays must be same length');

      await expect(magnet.depositMany(magnetIds, [], []))
        .to.be.revertedWith('Input arrays must be same length');

      await expect(magnet.depositMany([], [], []))
        .to.not.emit(magnet, 'Deposited'); // intended to not revert
    });

    it('Should revert if any token does not match magnet', async function() {
      const {magnet, tokens, addrs, magnetIds, magnetRecipients, magnetTokens} = await loadFixture(fixtureManyMagnetOneFunder);
      const owner = addrs[0];

      let amountToDeposit = 1000;
      let amountsToDeposit = Array(magnetIds.length).fill(amountToDeposit);

      let wrongToken = await deployMockContract(owner, IERC20.abi);
      magnetTokens[magnetTokens.length/2] = wrongToken.address;

      await expect(magnet.depositMany(magnetIds, amountsToDeposit, magnetTokens))
        .to.be.revertedWith('Deposit token address does not match magnet token');
    });

    it('Should revert if non-funder tries to depositMany', async function() {
      const {magnet, tokens, addrs, magnetIds, magnetRecipients, magnetTokens} = await loadFixture(fixtureManyMagnetOneFunder);
      let amountToDeposit = 1000;
      let amountsToDeposit = Array(magnetIds.length).fill(amountToDeposit);

      await expect(magnet.connect(addrs[1]).depositMany(magnetIds, amountsToDeposit, magnetTokens))
        .to.be.revertedWith('Caller is not the funder of this magnet');
    });

    // TODO: add tests and gas analysis for depositManyDifferentTokens
  });

  describe('Get Balances', function() {
    it('Should get correct amount ignoring cliff with valid input', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      let expectedAmountAtCliff = estimateVestedAmountIgnoringCliff(cliffTime, startTime, vestingPeriodLength, amountPerPeriod);
      let expectedAmountAtEnd = estimateVestedAmountIgnoringCliff(endTime, startTime, vestingPeriodLength, amountPerPeriod);

      let amountBeforeStart = await magnet.getVestedAmountIgnoringCliff(magnetId);
      expect(amountBeforeStart).to.equal(0);
      fastForwardEvmBy(CLIFF_TIME_DELTA - START_TIME_DELTA);

      let amountBeforeCliff = await magnet.getVestedAmountIgnoringCliff(magnetId);
      // console.log("amountBeforeCliff:", amountBeforeCliff.toString());
      // console.log("expectedAmountAtCliff", expectedAmountAtCliff);
      expect(amountBeforeCliff).to.be.above(0)
        .and.to.be.below(expectedAmountAtCliff);
      fastForwardEvmBy(END_TIME_DELTA - CLIFF_TIME_DELTA);

      let amountBeforeEnd = await magnet.getVestedAmountIgnoringCliff(magnetId);
      // console.log("amountBeforeEnd:", amountBeforeEnd.toString());
      // console.log("expectedAmountAtEnd", expectedAmountAtEnd);
      expect(amountBeforeEnd).to.be.above(0)
        .and.to.be.above(expectedAmountAtCliff)
        .and.to.be.below(expectedAmountAtEnd);
      fastForwardEvmBy(START_TIME_DELTA);

      let amountAfterEnd = await magnet.getVestedAmountIgnoringCliff(magnetId);
      // console.log("amountAfterEnd:", amountAfterEnd.toString());
      // console.log("expectedAmountAtEnd", expectedAmountAtEnd);
      expect(amountAfterEnd).to.equal(expectedAmountAtEnd);
    });

    it('Should get correct vested amount with valid input', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      let expectedAmountAtCliff = estimateVestedAmountIgnoringCliff(cliffTime, startTime, vestingPeriodLength, amountPerPeriod);
      let expectedAmountAtEnd = estimateVestedAmountIgnoringCliff(endTime, startTime, vestingPeriodLength, amountPerPeriod);

      let amountBeforeStart = await magnet.getVestedAmount(magnetId);
      expect(amountBeforeStart).to.equal(0);
      fastForwardEvmBy(CLIFF_TIME_DELTA - START_TIME_DELTA);

      let amountBeforeCliff = await magnet.getVestedAmount(magnetId);
      expect(amountBeforeCliff).to.equal(0);
      fastForwardEvmBy(END_TIME_DELTA - CLIFF_TIME_DELTA);

      let amountBeforeEnd = await magnet.getVestedAmount(magnetId);
      // console.log("amountBeforeEnd:", amountBeforeEnd.toString());
      // console.log("expectedAmountAtEnd", expectedAmountAtEnd);
      expect(amountBeforeEnd).to.be.above(0)
        .and.to.be.above(expectedAmountAtCliff)
        .and.to.be.below(expectedAmountAtEnd);
        fastForwardEvmBy(START_TIME_DELTA);

      let amountAfterEnd = await magnet.getVestedAmount(magnetId);
      // console.log("amountAfterEnd:", amountAfterEnd.toString());
      // console.log("expectedAmountAtEnd", expectedAmountAtEnd);
      expect(amountAfterEnd). to.equal(expectedAmountAtEnd);
    });

    it('Should get correct vested amount with cliff time equal to start time', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = startTime;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      let expectedAmountAtCliff = estimateVestedAmountIgnoringCliff(cliffTime, startTime, vestingPeriodLength, amountPerPeriod);
      let expectedAmountAtEnd = estimateVestedAmountIgnoringCliff(endTime, startTime, vestingPeriodLength, amountPerPeriod);

      let amountBeforeStart = await magnet.getVestedAmount(magnetId);
      expect(amountBeforeStart).to.equal(0);
      fastForwardEvmBy(CLIFF_TIME_DELTA - START_TIME_DELTA);

      let amountBeforeEnd = await magnet.getVestedAmount(magnetId);
      // console.log("amountBeforeEnd:", amountBeforeEnd.toString());
      // console.log("expectedAmountAtEnd", expectedAmountAtEnd);
      expect(amountBeforeEnd).to.be.above(0)
        .and.to.be.above(expectedAmountAtCliff)
        .and.to.be.below(expectedAmountAtEnd);
      fastForwardEvmBy(END_TIME_DELTA - CLIFF_TIME_DELTA + START_TIME_DELTA);

      let amountAfterEnd = await magnet.getVestedAmount(magnetId);
      // console.log("amountAfterEnd:", amountAfterEnd.toString());
      // console.log("expectedAmountAtEnd", expectedAmountAtEnd);
      expect(amountAfterEnd). to.equal(expectedAmountAtEnd);
    });

    it('Should get correct vested amount with cliff time equal to end time', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let endTime = now + END_TIME_DELTA;
      let cliffTime = endTime;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      let expectedAmountAtCliff = estimateVestedAmountIgnoringCliff(cliffTime, startTime, vestingPeriodLength, amountPerPeriod);
      let expectedAmountAtEnd = estimateVestedAmountIgnoringCliff(endTime, startTime, vestingPeriodLength, amountPerPeriod);
      expect(expectedAmountAtCliff).to.equal(expectedAmountAtEnd);

      let amountBeforeStart = await magnet.getVestedAmount(magnetId);
      expect(amountBeforeStart).to.equal(0);
      fastForwardEvmBy(END_TIME_DELTA - START_TIME_DELTA);

      let amountBeforeEnd = await magnet.getVestedAmount(magnetId);
      // console.log("amountBeforeEnd:", amountBeforeEnd.toString());
      // console.log("expectedAmountAtEnd", expectedAmountAtEnd);
      expect(amountBeforeEnd).to.equal(0);
      fastForwardEvmBy(START_TIME_DELTA);

      let amountAfterEnd = await magnet.getVestedAmount(magnetId);
      // console.log("amountAfterEnd:", amountAfterEnd.toString());
      // console.log("expectedAmountAtEnd", expectedAmountAtEnd);
      expect(amountAfterEnd).to.equal(expectedAmountAtEnd);
    });

    it('Should get correct vested amount with end time = indefinite', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = ethers.constants.MaxUint256;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      let expectedAmountAtCliff = estimateVestedAmountIgnoringCliff(cliffTime, startTime, vestingPeriodLength, amountPerPeriod);
      let expectedAmountAtEnd = estimateVestedAmountIgnoringCliff(endTime, startTime, vestingPeriodLength, amountPerPeriod);

      // fast forward to the far future
      fastForwardEvmBy(Number.MAX_SAFE_INTEGER);
      let amountInFarFuture = await magnet.getVestedAmount(magnetId);
      // console.log("amountInFarFuture:", amountInFarFuture.toString());
      // console.log("expectedAmountAtEnd", expectedAmountAtEnd.toString());
      expect(amountInFarFuture)
        .to.be.above(expectedAmountAtCliff)
        .to.be.below(expectedAmountAtEnd);
    });

    it('Should get correct vested amount owed before and after a withdrawal', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      let amount = END_TIME_DELTA - START_TIME_DELTA;
      await magnet.deposit(magnetId, amount, mockERC20.address);
      
      fastForwardEvmBy(END_TIME_DELTA);
      expect(await magnet.getVestedAmountOwed(magnetId)).to.equal(amount);

      let remainder = 1000;
      let amountToWithdraw = amount - remainder;
      await magnet.connect(addr1).withdraw(magnetId, amountToWithdraw);
      expect(await magnet.getVestedAmountOwed(magnetId)).to.equal(remainder);

      await magnet.connect(addr1).withdraw(magnetId, remainder);
      expect(await magnet.getVestedAmountOwed(magnetId)).to.equal(0);
    });

    it('Available Balance should be 0 when balance is 0 for any caller', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      expect(await magnet.getAvailableBalance(magnetId, owner.address)).to.equal(0);
      expect(await magnet.getAvailableBalance(magnetId, recipient)).to.equal(0);
      const [ , , other] = await ethers.getSigners();
      expect(await magnet.getAvailableBalance(magnetId, other.address)).to.equal(0);
    });

    it('When balance > amountOwed, amountOwed should be available to recipient and remainder available to funder', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      let amount = END_TIME_DELTA - START_TIME_DELTA;
      await magnet.deposit(magnetId, amount, mockERC20.address);
      
      fastForwardEvmBy(CLIFF_TIME_DELTA);
      let expectedAmountAtCliff = estimateVestedAmountIgnoringCliff(cliffTime, startTime, vestingPeriodLength, amountPerPeriod);
      let expectedAmountAtEnd = estimateVestedAmountIgnoringCliff(endTime, startTime, vestingPeriodLength, amountPerPeriod);
      
      let balanceAvailableToRecipient = Number(await magnet.getAvailableBalance(magnetId, recipient));
      expect(balanceAvailableToRecipient)
        .and.to.be.above(expectedAmountAtCliff)
        .and.to.be.below(expectedAmountAtEnd);

      let balanceAvailableToFunder = Number(await magnet.getAvailableBalance(magnetId, owner.address));
      expect(balanceAvailableToFunder)
        .and.to.be.below(amount - expectedAmountAtCliff.toNumber())
        .and.to.be.above(0);

      expect(balanceAvailableToRecipient + balanceAvailableToFunder).to.equal(amount);
    });

    it('When balance < amountOwed, balance should be available to recipient and 0 available to funder', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      let amount = CLIFF_TIME_DELTA / 10;
      await magnet.deposit(magnetId, amount, mockERC20.address);
      
      fastForwardEvmBy(CLIFF_TIME_DELTA);
      
      // recipient is owed CLIFF_TIME_DELTA worth of token, but balance is only CLIFF_TIME / 10
      // the full amount of the balance should be available to recipient
      // and 0 should be available to funder because the balance has already vested.
      expect(await magnet.getAvailableBalance(magnetId, recipient))
        .and.to.be.equal(amount);

      expect(await magnet.getAvailableBalance(magnetId, owner.address))
        .and.to.be.equal(0);
    });

  });

  describe('Withdraw', function() {
    it('Funder should be able to withdraw whole amount before start time', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);

      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
  
      let magnetId = (await magnet.nextVestingMagnetId()).sub(1);
      let amount = END_TIME_DELTA - START_TIME_DELTA;
      await magnet.deposit(magnetId, amount, mockERC20.address);
  
      let amountToWithdraw = amount;
      await expect(magnet.withdraw(magnetId, amountToWithdraw))
        .to.emit(magnet, 'Withdrawn')
        .withArgs(owner.address, magnetId, mockERC20.address, amountToWithdraw);
      
      let resultMagnet = await magnet.vestingMagnets(magnetId);
      expect(resultMagnet.balance).to.equal(0);
      expect(resultMagnet.amountWithdrawn).to.be.equal(0);
    });

    it('Funder should be able to withdraw whole amount before cliff time', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);

      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
  
      let magnetId = (await magnet.nextVestingMagnetId()).sub(1);
      let amount = END_TIME_DELTA - START_TIME_DELTA;
      await magnet.deposit(magnetId, amount, mockERC20.address);
  
      fastForwardEvmBy(CLIFF_TIME_DELTA - START_TIME_DELTA);
      let amountToWithdraw = amount;
      await expect(magnet.withdraw(magnetId, amountToWithdraw))
        .to.emit(magnet, 'Withdrawn')
        .withArgs(owner.address, magnetId, mockERC20.address, amountToWithdraw);
      
      let resultMagnet = await magnet.vestingMagnets(magnetId);
      expect(resultMagnet.balance).to.equal(0);
      expect(resultMagnet.amountWithdrawn).to.be.equal(0);
    });

    it('Funder should be able to withdraw whole amount before end time', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);

      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
  
      let magnetId = (await magnet.nextVestingMagnetId()).sub(1);
      let amount = END_TIME_DELTA - START_TIME_DELTA;
      await magnet.deposit(magnetId, amount, mockERC20.address);
  
      fastForwardEvmBy(END_TIME_DELTA - START_TIME_DELTA);
      let amountToWithdraw = amount;
      await expect(magnet.withdraw(magnetId, amountToWithdraw))
        .to.emit(magnet, 'Withdrawn');
      
      let resultMagnet = await magnet.vestingMagnets(magnetId);
      let vestedAmount = estimateVestedAmountIgnoringCliff(END_TIME_DELTA - START_TIME_DELTA, startTime, vestingPeriodLength, amountPerPeriod)
      expect(resultMagnet.balance)
        .to.be.at.least(vestedAmount)
        .and.to.be.below(amount);
    });
    
    it('Funder should be able to withdraw zero after end time', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);

      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
  
      let magnetId = (await magnet.nextVestingMagnetId()).sub(1);
      let amount = END_TIME_DELTA - START_TIME_DELTA;
      await magnet.deposit(magnetId, amount, mockERC20.address);
  
      fastForwardEvmBy(END_TIME_DELTA);
      let amountToWithdraw = amount;
      await expect(magnet.withdraw(magnetId, amountToWithdraw))
        .to.be.revertedWith('Available balance is zero');
      
      let resultMagnet = await magnet.vestingMagnets(magnetId);
      expect(resultMagnet.balance).to.be.equal(amount);
    });

    it('Recipient should be able to withdraw at various times', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);

      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
  
      let magnetId = (await magnet.nextVestingMagnetId()).sub(1);
      let amount = END_TIME_DELTA - START_TIME_DELTA;
      await magnet.deposit(magnetId, amount, mockERC20.address);
  
      let amountToWithdraw = 1000;

      // attempt withdraw before startTime
      await expect(magnet.connect(addr1).withdraw(magnetId, amountToWithdraw))
        .to.be.revertedWith('Available balance is zero');

      // attempt withdraw before cliffTime
      fastForwardEvmBy(CLIFF_TIME_DELTA - START_TIME_DELTA);
      await expect(magnet.connect(addr1).withdraw(magnetId, amountToWithdraw))
        .to.be.revertedWith('Available balance is zero');

      // attempt withdraw after cliffTime, before endTime
      fastForwardEvmBy(END_TIME_DELTA - CLIFF_TIME_DELTA);
      await expect(magnet.connect(addr1).withdraw(magnetId, amountToWithdraw))
        .to.emit(magnet, 'Withdrawn');
      let resultMagnet = await magnet.vestingMagnets(magnetId);
      expect(resultMagnet.balance).to.be.equal(amount - amountToWithdraw);
      expect(resultMagnet.amountWithdrawn).to.be.equal(amountToWithdraw);

      // attempt withdraw after endTime
      fastForwardEvmBy(START_TIME_DELTA);
      await expect(magnet.connect(addr1).withdraw(magnetId, amountToWithdraw))
        .to.emit(magnet, 'Withdrawn');
      let afterMagnet = await magnet.vestingMagnets(magnetId);
      expect(afterMagnet.balance).to.be.equal(amount - 2*amountToWithdraw);
      expect(afterMagnet.amountWithdrawn).to.be.equal(2*amountToWithdraw);
    });

    it('Should revert if magnet does not exist', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let magnetId = await (await magnet.getMagnetCount()).add(10);
      let amountToWithdraw = 1;
      await expect(magnet.withdraw(magnetId, amountToWithdraw))
        .to.be.revertedWith('Magnet does not exist');
    });

    it('Should revert if called by non-funder and non-recipient', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);

      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
  
      let magnetId = (await magnet.nextVestingMagnetId()).sub(1);
      let amount = END_TIME_DELTA - START_TIME_DELTA;
      await magnet.deposit(magnetId, amount, mockERC20.address);
  
      let amountToWithdraw = 1;
      const [ , , other] = await ethers.getSigners();
      await expect(magnet.connect(other).withdraw(magnetId, amountToWithdraw))
        .to.be.revertedWith('Caller is not the funder or recipient of this magnet');
    });

    it('When balance > amountOwed, recipient should be able to withdraw up to amountOwed and no more', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      let amount = END_TIME_DELTA - START_TIME_DELTA;
      await magnet.deposit(magnetId, amount, mockERC20.address);
      
      fastForwardEvmBy(CLIFF_TIME_DELTA);
      let expectedAmountAtCliff = estimateVestedAmountIgnoringCliff(cliffTime, startTime, vestingPeriodLength, amountPerPeriod);
      let expectedAmountAtEnd = estimateVestedAmountIgnoringCliff(endTime, startTime, vestingPeriodLength, amountPerPeriod);
      
      let tooMuch = amount + 100000;
      await magnet.connect(addr1).withdraw(magnetId, tooMuch);

      let balanceAvailableToRecipient = Number(await magnet.getAvailableBalance(magnetId, recipient));
      expect(balanceAvailableToRecipient).to.be.equal(0);

      let afterMagnet = await magnet.vestingMagnets(magnetId);
      expect(afterMagnet.amountWithdrawn)
        .to.be.below(expectedAmountAtEnd)
        .to.be.above(expectedAmountAtCliff);

      expect(afterMagnet.balance)
        .to.be.below(expectedAmountAtEnd)
        .to.be.above(0);

      expect(Number(afterMagnet.amountWithdrawn) + Number(afterMagnet.balance)).to.equal(amount);
    });

    it('When balance < amountOwed, recipient should be able to withdraw full balance', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      let amount = CLIFF_TIME_DELTA / 10;
      await magnet.deposit(magnetId, amount, mockERC20.address);
      
      fastForwardEvmBy(CLIFF_TIME_DELTA);

      let expectedAmountAtCliff = estimateVestedAmountIgnoringCliff(cliffTime, startTime, vestingPeriodLength, amountPerPeriod);
      await expect(magnet.connect(addr1).withdraw(magnetId, expectedAmountAtCliff))
        .to.emit(magnet, 'Withdrawn')
        .withArgs(recipient, magnetId, mockERC20.address, amount);

      expect(await magnet.getAvailableBalance(magnetId, recipient)).and.to.be.equal(0);
      expect(await magnet.getVestedAmountOwed(magnetId))
        .and.to.be.above(0)
        .to.be.below(expectedAmountAtCliff);

      let afterMagnet = await magnet.vestingMagnets(magnetId);
      expect(afterMagnet.amountWithdrawn).to.equal(amount);
      expect(afterMagnet.balance).to.equal(0)
    });

    it('When balance > amountOwed, funder should be able to withdraw (balance - amountOwed) and no more', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      let amount = END_TIME_DELTA - START_TIME_DELTA;
      await magnet.deposit(magnetId, amount, mockERC20.address);
      
      fastForwardEvmBy(CLIFF_TIME_DELTA);
      let expectedAmountAtCliff = estimateVestedAmountIgnoringCliff(cliffTime, startTime, vestingPeriodLength, amountPerPeriod);
      
      let tooMuch = amount + 100000;
      await magnet.withdraw(magnetId, tooMuch);

      expect(await magnet.getAvailableBalance(magnetId, owner.address)).to.equal(0);

      let afterMagnet = await magnet.vestingMagnets(magnetId);
      expect(afterMagnet.amountWithdrawn).to.equal(0);
      expect(afterMagnet.balance)
        .to.be.below(amount)
        .to.be.above(expectedAmountAtCliff);
    });

    it('When balance < amountOwed, funder should be able to withdraw zero', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);
      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = now + END_TIME_DELTA;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
      let magnetId = 0;

      let amount = CLIFF_TIME_DELTA / 10;
      await magnet.deposit(magnetId, amount, mockERC20.address);
      
      fastForwardEvmBy(CLIFF_TIME_DELTA);
      
      let tooMuch = 1;
      await expect(magnet.withdraw(magnetId, tooMuch))
        .to.be.revertedWith('Available balance is zero');
    });

    it('Recipient should be able to withdraw correct amount when end time is indefinite', async function() {
      const {magnet, mockERC20, owner, addr1} = await loadFixture(fixtureRegisterFunder);

      let recipient = addr1.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + START_TIME_DELTA;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + CLIFF_TIME_DELTA;
      let endTime = ethers.constants.MaxUint256;
      let message = "Message 1";
      await magnet.mintVestingMagnet(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);
  
      let magnetId = (await magnet.nextVestingMagnetId()).sub(1);
      let amount = Number.MAX_SAFE_INTEGER - START_TIME_DELTA;
      await magnet.deposit(magnetId, amount, mockERC20.address);
  
      fastForwardEvmBy(Number.MAX_SAFE_INTEGER);
      let amountToWithdraw = amount;
      await expect(magnet.connect(addr1).withdraw(magnetId, amountToWithdraw))
        .to.emit(magnet, 'Withdrawn')
        .withArgs(addr1.address, magnetId, mockERC20.address, amountToWithdraw);
      
      let resultMagnet = await magnet.vestingMagnets(magnetId);
      expect(resultMagnet.balance).to.equal(0);
      expect(resultMagnet.amountWithdrawn).to.be.equal(amountToWithdraw);
    });
  });

  // describe('Admin', function() {
  //   // TODO: test isAdmins mapping, adminFunder array, helper function
  //   // TODO: add a test in mint() to prevent or require funder from being in admins array
  // });
});