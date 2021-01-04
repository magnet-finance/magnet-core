import {assert, expect, should, use} from 'chai';
import {Contract, utils, Wallet} from 'ethers';
import {loadFixture, deployContract, MockProvider, solidity} from 'ethereum-waffle';
import Compeer from '../build/Compeer.json';

use(solidity);

const USDC_address = utils.getAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');

function getTimeInSeconds() {
  return Math.floor(new Date().getTime() / 1000)
}

describe('Compeer', () => {
  async function fixture([wallet, other]: Wallet[], provider: MockProvider) {
    const contract = await deployContract(wallet, Compeer);
    return {contract, wallet, other};
  }

  async function fixtureRegisterFunder([wallet, other]: Wallet[], provider: MockProvider) {
    const contract = await deployContract(wallet, Compeer);
    let admins = [other.address];
    let name = "Funder 1";
    let description = "Description 1";
    let imageUrl = "imageUrl 1";
    await contract.registerFunder(admins, name, description, imageUrl);
    return {contract, wallet, other};
  }

  // Positive tests: given valid input, performs as expected
  // Negative tests: given invalid input, captures errors

  describe('Deploy', () => {
    it('Contract should be defined', async () => {
      const {contract, wallet, other} = await loadFixture(fixture);
      assert.isDefined(contract);
    });

    it('State variables initialized to zero', async () => {
      const {contract, wallet, other} = await loadFixture(fixture);
      expect(await contract.nextVestingCarrotId()).to.equal(0);
      expect(await contract.getFunderCount()).to.equal(0);
      expect(await contract.isFunder(wallet.address)).to.be.equal(false);
      expect(await contract.getCarrotCount()).to.equal(0);
      expect(await contract.isCarrot(0)).to.be.equal(false);
    });
  });

  describe('Funder', () => {
    it('Register funder with valid data', async () => {
      const {contract, wallet, other} = await loadFixture(fixture);
      let admins = [other.address];
      let name = "Funder 1";
      let description = "Description 1";
      let imageUrl = "imageUrl 1";

      let expectedId = await contract.getFunderCount();
      await expect(contract.registerFunder(admins, name, description, imageUrl))
        .to.emit(contract, 'FunderRegistered')
        .withArgs(wallet.address, expectedId);

      let funder = await contract.funders(wallet.address);
      expect(funder.id).to.equal(0);
      expect(funder.name).to.equal(name);
      expect(funder.funder).to.equal(wallet.address);
      expect(funder.description).to.equal(description);
      expect(await contract.getFunderCount()).to.equal(1);
      expect(await contract.isFunder(wallet.address)).to.be.equal(true);
      expect(await contract.getCarrotIdsByFunder(wallet.address)).to.eql([]);
      expect(await contract.getAdminsByFunder(wallet.address)).to.eql(admins);
      expect(await contract.isAdmin(other.address, wallet.address)).to.be.equal(true);
    });

    it('Reverts if sender is already registered as a funder', async () => {
      const {contract, wallet, other} = await loadFixture(fixture);
      let admins = [other.address];
      let name = "Funder 1";
      let description = "Description 1";
      let imageUrl = "imageUrl 1";

      await contract.registerFunder(admins, name, description, imageUrl);
      await expect(contract.registerFunder(admins, name, description, imageUrl))
        .to.be.revertedWith('Funder already exists');    
    });

    it('Is not funder', async () => {
      const {contract, wallet, other} = await loadFixture(fixture);
      expect(await contract.isFunder(wallet.address)).to.be.equal(false);
    });

    it('Reverts if funder does not exist', async () => {
      const {contract, wallet, other} = await loadFixture(fixture);
      await expect(contract.getCarrotCountByFunder(wallet.address))
        .to.be.revertedWith('Not a funder');
      await expect(contract.getCarrotIdsByFunder(wallet.address))
        .to.be.revertedWith('Not a funder');
      await expect(contract.getAdminsByFunder(wallet.address))
        .to.be.revertedWith('Not a funder');
    });

    // TODO: add test to prevent or require funder from being in admins array
  });

  describe('VestingCarrot', () => {
    it('Mint a VestingCarrot with valid data', async () => {
      const {contract, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = USDC_address;
      let now = getTimeInSeconds();
      let startTime = now + 2;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 4;
      let endTime = now + 6;
      let message = "Message 1";

      let expectedId = await contract.getCarrotCount();
      await expect(contract.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.emit(contract, 'VestingCarrotMinted')
        .withArgs(recipient, wallet.address, expectedId);

      let carrot = await contract.vestingCarrots(expectedId);
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

      expect(await contract.isCarrot(expectedId)).to.be.equal(true);
      expect(await contract.getCarrotCount()).to.equal(1);
      expect(await contract.getBalance(expectedId)).to.equal(0);
      expect(await contract.getCarrotCountByFunder(wallet.address)).to.be.equal(1);
      expect((await contract.getCarrotIdsByFunder(wallet.address))[0]).to.equal(0);
      expect((await contract.getCarrotsByRecipient(recipient))[0])
        .to.equal(expectedId);
    });

    it('Is not carrot', async () => {
      const {contract, wallet, other} = await loadFixture(fixtureRegisterFunder);
      expect(await contract.isCarrot(0)).to.be.equal(false);
    });

    it('Reverts if carrot does not exist', async () => {
      const {contract, wallet, other} = await loadFixture(fixtureRegisterFunder);
      await expect(contract.getBalance(0))
        .to.be.revertedWith('Carrot does not exist');
    });

    it('Revert Mint if sender has not registered as funder', async () => {
      const {contract, wallet, other} = await loadFixture(fixture);
      let recipient = other.address;
      let token = USDC_address;
      let now = getTimeInSeconds();
      let startTime = now + 2;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 4;
      let endTime = now + 6;
      let message = "Message 1";

      await expect(contract.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Must register as funder first');
    });

    it('Revert if startTime is in the past', async () => {
      const {contract, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = USDC_address;
      let now = getTimeInSeconds();
      let startTime = now - 1;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 4;
      let endTime = now + 6;
      let message = "Message 1";

      await expect(contract.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Start time is in the past');

      let zeroTime = 0;
      await expect(contract.mintVestingCarrot(recipient, token, zeroTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Start time is in the past');
    });

    it('Revert if cliffTime is invalid', async () => {
      const {contract, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = USDC_address;
      let now = getTimeInSeconds();
      let startTime = now +2 ;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now - 1;
      let endTime = now + 6;
      let message = "Message 1";

      await expect(contract.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Cliff time must be >= start time');

      let zeroTime = 0;
      await expect(contract.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, zeroTime, endTime, message))
        .to.be.revertedWith('Cliff time must be >= start time');
    });

    it('Revert if endTime is in the past', async () => {
      const {contract, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = USDC_address;
      let now = getTimeInSeconds();
      let startTime = now +2 ;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 1;
      let cliffTime = now + 4;
      let endTime = now - 1;
      let message = "Message 1";

      await expect(contract.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('End time must be > start time and cliff time');

      let zeroTime = 0;
      await expect(contract.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, zeroTime, message))
        .to.be.revertedWith('End time must be > start time and cliff time');
    });

    it('Revert if vesting period is longer than duration', async () => {
      const {contract, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = USDC_address;
      let now = getTimeInSeconds();
      let startTime = now +2 ;
      let vestingPeriodLength = 5;
      let amountPerPeriod = 1;
      let cliffTime = now + 4;
      let endTime = now + 6;
      let message = "Message 1";

      await expect(contract.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Period must be < duration');
    });

    it('Revert if vesting period is zero', async () => {
      const {contract, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = USDC_address;
      let now = getTimeInSeconds();
      let startTime = now +2 ;
      let vestingPeriodLength = 0;
      let amountPerPeriod = 1;
      let cliffTime = now + 4;
      let endTime = now + 6;
      let message = "Message 1";

      await expect(contract.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Vesting Period must be >0');
    });

    it('Revert if amount per period is zero', async () => {
      const {contract, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = USDC_address;
      let now = getTimeInSeconds();
      let startTime = now +2 ;
      let vestingPeriodLength = 1;
      let amountPerPeriod = 0;
      let cliffTime = now + 4;
      let endTime = now + 6;
      let message = "Message 1";

      await expect(contract.mintVestingCarrot(recipient, token, startTime, vestingPeriodLength, amountPerPeriod, cliffTime, endTime, message))
        .to.be.revertedWith('Amount must be >0');
    });

    // TODO: prevent recipient being zero address?
  });

  describe('Admin', () => {
    // TODO: test isAdmins mapping, adminFunder array, helper function
  });

});