import {expect, use} from 'chai';
import {Contract} from 'ethers';
import {deployContract, MockProvider, solidity} from 'ethereum-waffle';
import Compeer from '../build/Compeer.json';

use(solidity);

describe('Compeer', () => {
  const [wallet, walletTo] = new MockProvider().getWallets();
  let c: Contract;

  beforeEach(async () => {
    c = await deployContract(wallet, Compeer);
  });

  it('Next Vesting Carrot Id is zero', async () => {
    expect(await c.nextVestingCarrotId.to.equal(0));
  });

});