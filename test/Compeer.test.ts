import {assert, expect, should, use} from 'chai';
import {Contract, utils, Wallet} from 'ethers';
import {loadFixture, deployContract, deployMockContract, MockProvider, solidity} from 'ethereum-waffle';
import IERC20 from '../build/IERC20.json';
import Compeer from '../build/Compeer.json';

use(solidity);
// var artifacts = require('truffle-artifactor');
// const ERC20Mock = artifacts.require("./ERC20Mock.sol"); // add into folder if you need it

const zero_address = utils.getAddress('0x0000000000000000000000000000000000000000');

function getTimeInSeconds() {
  return Math.floor(new Date().getTime() / 1000)
}

describe('Compeer', () => {

  async function fixtureBase([wallet, other]: Wallet[], provider: MockProvider) {
    const compeer = await deployContract(wallet, Compeer);
    const mockERC20 = await deployMockContract(wallet, IERC20.abi);
    return {compeer, mockERC20, wallet, other};
  }

  async function fixtureRegisterFunder([wallet, other]: Wallet[], provider: MockProvider) {
    const compeer = await deployContract(wallet, Compeer);
    const mockERC20 = await deployMockContract(wallet, IERC20.abi);
    let admins = [other.address];
    let name = "Funder 1";
    let description = "Description 1";
    let imageUrl = "imageUrl 1";
    await compeer.registerFunder(admins, name, description, imageUrl);
    return {compeer, mockERC20, wallet, other};
  }

  async function fixtureOneFunderAndCarrot([wallet, other]: Wallet[], provider: MockProvider) {
    const compeer = await deployContract(wallet, Compeer);
    const mockERC20 = await deployMockContract(wallet, IERC20.abi);
    
    let admins = [other.address];
    let name = "Funder 1";
    let description = "Description 1";
    let imageUrl = "imageUrl 1";
    await compeer.registerFunder(admins, name, description, imageUrl);

    let recipient = other.address;
    let token = mockERC20.address;
    let now = getTimeInSeconds();
    let startTime = now + 2;
    let vestingPeriodLength = 1;
    let amountPerPeriod = 1;
    let cliffTime = now + 4;
    let endTime = now + 6;
    let message = "Message 1";
    await compeer.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message);

    return {compeer, mockERC20, wallet, other};
  }

  // Positive tests: given valid input, performs as expected
  // Negative tests: given invalid input, captures errors

  describe('Deploy', () => {
    it('Contracts should be defined', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureBase);
      assert.isDefined(compeer);
      assert.isDefined(mockERC20);
    });

    it('State variables initialized to zero', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureBase);
      expect(await compeer.nextVestingCarrotId()).to.equal(0);
      expect(await compeer.getFunderCount()).to.equal(0);
      expect(await compeer.isFunder(wallet.address)).to.be.equal(false);
      expect(await compeer.getCarrotCount()).to.equal(0);
      expect(await compeer.isCarrot(0)).to.be.equal(false);
    });
  });

  describe('Funder', () => {
    it('Register funder with valid data', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureBase);
      let admins = [other.address];
      let name = "Funder 1";
      let description = "Description 1";
      let imageUrl = "imageUrl 1";

      let expectedId = await compeer.getFunderCount();
      await expect(compeer.registerFunder(admins, name, description, imageUrl))
        .to.emit(compeer, 'FunderRegistered')
        .withArgs(wallet.address, expectedId);

      let funder = await compeer.funders(wallet.address);
      expect(funder.id).to.equal(0);
      expect(funder.name).to.equal(name);
      expect(funder.funder).to.equal(wallet.address);
      expect(funder.description).to.equal(description);
      expect(await compeer.getFunderCount()).to.equal(1);
      expect(await compeer.isFunder(wallet.address)).to.be.equal(true);
      expect(await compeer.getCarrotIdsByFunder(wallet.address)).to.eql([]);
      expect(await compeer.getAdminsByFunder(wallet.address)).to.eql(admins);
      expect(await compeer.isAdmin(other.address, wallet.address)).to.be.equal(true);
    });

    it('Reverts if sender is already registered as a funder', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureBase);
      let admins = [other.address];
      let name = "Funder 1";
      let description = "Description 1";
      let imageUrl = "imageUrl 1";

      await compeer.registerFunder(admins, name, description, imageUrl);
      await expect(compeer.registerFunder(admins, name, description, imageUrl))
        .to.be.revertedWith('Funder already exists');    
    });

    it('Is not funder', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureBase);
      expect(await compeer.isFunder(wallet.address)).to.be.equal(false);
    });

    it('Reverts if funder does not exist', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureBase);
      await expect(compeer.getCarrotCountByFunder(wallet.address))
        .to.be.revertedWith('Not a funder');
      await expect(compeer.getCarrotIdsByFunder(wallet.address))
        .to.be.revertedWith('Not a funder');
      await expect(compeer.getAdminsByFunder(wallet.address))
        .to.be.revertedWith('Not a funder');
    });

    // TODO: add test to prevent or require funder from being in admins array
  });

  describe('VestingCarrot', () => {
    it('Mint a VestingCarrot with valid data', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + 2;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 4;
      let endTime = now + 6;
      let message = "Message 1";

      let expectedId = await compeer.getCarrotCount();
      await expect(compeer.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.emit(compeer, 'VestingCarrotMinted')
        .withArgs(recipient, wallet.address, expectedId);

      let carrot = await compeer.vestingCarrots(expectedId);
      expect(carrot.recipient).to.equal(recipient);
      expect(carrot.token).to.equal(token);
      expect(carrot.funder).to.equal(wallet.address);
      expect(carrot.id).to.equal(expectedId);
      expect(carrot.startTime).to.equal(startTime);
      expect(carrot.vestingPeriodLength).to.equal(vestingPeriodLength);
      expect(carrot.amountPerPeriod).to.equal(amountPerPeriod);
      expect(carrot.cliffTime).to.equal(cliffTime);
      expect(carrot.endTime).to.equal(endTime);
      expect(carrot.message).to.equal(message);

      expect(await compeer.isCarrot(expectedId)).to.be.equal(true);
      expect(await compeer.getCarrotCount()).to.equal(1);
      expect(await compeer.getBalance(expectedId)).to.equal(0);
      expect(await compeer.getCarrotCountByFunder(wallet.address)).to.be.equal(1);
      expect((await compeer.getCarrotIdsByFunder(wallet.address))[0]).to.equal(0);
      expect((await compeer.getCarrotsByRecipient(recipient))[0])
        .to.equal(expectedId);
    });

    it('Is not carrot', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureRegisterFunder);
      expect(await compeer.isCarrot(0)).to.be.equal(false);
    });

    it('Reverts if carrot does not exist', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureRegisterFunder);
      await expect(compeer.getBalance(0))
        .to.be.revertedWith('Carrot does not exist');
    });

    it('Revert Mint if sender has not registered as funder', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureBase);
      let recipient = other.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now + 2;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 4;
      let endTime = now + 6;
      let message = "Message 1";

      await expect(compeer.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Must register as funder first');
    });

    it('Revert if recipient is zero address', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = zero_address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now +2 ;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 4;
      let endTime = now + 6;
      let message = "Message 1";

      await expect(compeer.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Recipient cant be the zero address');
    });

    it('Revert if startTime is in the past', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now - 1;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 4;
      let endTime = now + 6;
      let message = "Message 1";

      await expect(compeer.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Start time is in the past');

      let zeroTime = 0;
      await expect(compeer.mintVestingCarrot(recipient, token, zeroTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Start time is in the past');
    });

    it('Revert if cliffTime is invalid', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now +2 ;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now - 1;
      let endTime = now + 6;
      let message = "Message 1";

      await expect(compeer.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Cliff time must be >= start time');

      let zeroTime = 0;
      await expect(compeer.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, zeroTime, endTime, message))
        .to.be.revertedWith('Cliff time must be >= start time');
    });

    it('Revert if endTime is in the past', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now +2 ;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 4;
      let endTime = now - 1;
      let message = "Message 1";

      await expect(compeer.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('End time must be > start time and cliff time');

      let zeroTime = 0;
      await expect(compeer.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, zeroTime, message))
        .to.be.revertedWith('End time must be > start time and cliff time');
    });

    it('Revert if vesting period is longer than duration', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now +2 ;
      let vestingPeriodLength = 5;
      let amountPerPeriod = 1;
      let cliffTime = now + 4;
      let endTime = now + 6;
      let message = "Message 1";

      await expect(compeer.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Period must be < duration');
    });

    it('Revert if vesting period is zero', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now +2 ;
      let vestingPeriodLength = 0;
      let amountPerPeriod = 1;
      let cliffTime = now + 4;
      let endTime = now + 6;
      let message = "Message 1";

      await expect(compeer.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Vesting Period must be >0');
    });

    it('Revert if amount per period is zero', async () => {
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = mockERC20.address;
      let now = getTimeInSeconds();
      let startTime = now +2 ;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 0;
      let cliffTime = now + 4;
      let endTime = now + 6;
      let message = "Message 1";

      await expect(compeer.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Amount must be >0');
    });

    // TODO: prevent recipient being zero address?
  });

  describe('Deposit - Vesting Carrot', () => {
    it('Deposit to a VestingCarrot with valid data', async function() {
      this.timeout(4000);
      const {compeer, mockERC20, wallet, other} = await loadFixture(fixtureOneFunderAndCarrot);
      let expectedSender = wallet.address;
      let expectedRecipient = compeer.address;
      let carrotId = await compeer.nextVestingCarrotId() - 1;
      let amount = 1000;
      let currentBalance = await compeer.getBalance(carrotId);
      let expectedBalance = currentBalance + amount;

      // initialize the mock contract to spoof return 'true' when transferFrom is called
      await mockERC20.mock.transferFrom.returns(true);
      await expect(compeer.deposit(carrotId, amount, mockERC20.address))
        .to.emit(compeer, 'Deposited')
        .withArgs(wallet.address, carrotId, amount);
      expect("transferFrom").to.be.calledOnContractWith(mockERC20, [expectedSender, expectedRecipient, amount]);

      expect(await compeer.getBalance(carrotId)).to.equal(expectedBalance);
    });
  });

  // try to deposit 0
  // deposit to make balance wrap - exceed int limit
  // try to deposit wrong token
  // reject a non-funder attempt to deposit

  // describe('Admin', () => {
  //   // TODO: test isAdmins mapping, adminFunder array, helper function
  // });

});