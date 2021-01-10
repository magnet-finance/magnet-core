const Magnet = artifacts.require("./Magnet.sol");

module.exports = function(deployer) {
    console.log("Deploying Magnet...");
    deployer.deploy(Magnet);
}