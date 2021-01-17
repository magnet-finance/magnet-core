import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";

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
  typechain: {
    outDir: "build/typechain",
  },
  solidity: "0.6.12",
};
