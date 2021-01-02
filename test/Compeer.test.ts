import {assert, expect, should, use} from 'chai';
import {Contract, Wallet} from 'ethers';
import {loadFixture, deployContract, MockProvider, solidity} from 'ethereum-waffle';
import Compeer from '../build/Compeer.json';

use(solidity);

describe('Compeer', () => {
  async function fixture([wallet, other]: Wallet[], provider: MockProvider) {
    const contract = await deployContract(wallet, Compeer);
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
      expect(await contract["getCarrotCount()"]()).to.equal(0);
      expect(await contract.isCarrot(0)).to.be.equal(false);
    });
  });

  describe('Funder', () => {
    it('Register funder', async () => {
      const {contract, wallet, other} = await loadFixture(fixture);
      let admins = [other.address];
      let name = "Funder 1";
      let description = "Description 1";
      let imageUrl = "imageUrl 1";

      await contract.registerFunder(admins, name, description, imageUrl);

      let funder = await contract.funders(wallet.address);
      expect(funder.id).to.equal(0);
      expect(await contract.getCarrotIdsOfFunder(wallet.address)).to.eql([]);
      expect(funder.name).to.equal(name);
      expect(funder.funder).to.equal(wallet.address);
      expect(await contract.getAdminsOfFunder(wallet.address)).to.eql(admins);
      expect(funder.description).to.equal(description);

      expect(await contract.getFunderCount()).to.equal(1);
      expect(await contract.isFunder(wallet.address)).to.be.equal(true);
      expect(await contract.isAdmin(other.address, wallet.address)).to.be.equal(true);
    });

    // register with empty admins array. should work and return 0 admins
    // register with empty strings. do i allow that?
    // register a second time - should revert
  
  });

  describe('Carrot', () => {

  });

});