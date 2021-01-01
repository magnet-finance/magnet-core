const Compeer = artifacts.require("./Compeer.sol");

module.exports = function(deployer) {
    console.log("Deploying Compeer...");
    deployer.deploy(Compeer);
}