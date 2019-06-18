const Payroll = artifacts.require("Payroll");

module.exports = function(deployer, env, accounts) {
  deployer.deploy(Payroll, accounts[1]);
};
