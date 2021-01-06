import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";

// Learn how to write a custom Hardhat task at
// https://hardhat.org/guides/create-task.html

task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(await account.address);
  }
});

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  paths: {
    sources: "./contracts",
    artifacts: "./build",
  },
  solidity: "0.6.12",
};
