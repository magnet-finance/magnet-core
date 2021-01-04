import {assert, expect, should, use} from 'chai';
import {Contract, utils, Wallet} from 'ethers';
import {loadFixture, deployContract, MockProvider, solidity} from 'ethereum-waffle';
import Compeer from '../build/Compeer.json';

use(solidity);

const USDC_address = utils.getAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');

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

    // TODO: add test to prevent or require funder from being in admins array
  });

  describe('VestingCarrot', () => {
    it('Mint a VestingCarrot with valid data', async () => {
      const {contract, wallet, other} = await loadFixture(fixtureRegisterFunder);
      let recipient = other.address;
      let token = USDC_address;
      let now = new Date().getTime();
      let startTime = now + 2000;
      let vestingPeriodLength = 1000;
      let amountPerPeriod = 1;
      let cliffTime = now + 4000;
      let endTime = now + 6000;
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

  });

  describe('Admin', () => {
    // TODO: test isAdmins mapping, adminFunder array, helper function
  });

});