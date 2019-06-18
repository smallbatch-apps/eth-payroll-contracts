const Payroll = artifacts.require("Payroll");
const ethers = require('ethers');
const assertRevert = require('./utils/assertRevert');

const addDays = require('date-fns/addDays');
const subDays = require('date-fns/subDays');
const getTime = require('date-fns/getTime');

const provider = new ethers.providers.JsonRpcProvider("http://localhost:7545");

const toSeconds = date => Math.floor(getTime(date) /1000);



contract('Payroll', accounts => {
  const [OWNER, EMPLOYEE] = accounts;
  let ethOwnerInstance = false;
  let ethEmployeeInstance = false;
  let truffleInstance = false;

  const value = 6500;
  const ownerSigner = provider.getSigner(0);
  const employeeSigner = provider.getSigner(1);
  const yesterday = toSeconds(subDays(new Date, 1));
  const inOneWeek = toSeconds(addDays(new Date, 7));

  describe("Contract setup", () => {

    beforeEach(async () => {
      truffleInstance = await Payroll.new(EMPLOYEE);
      ethOwnerInstance = await createEthersContractAs(truffleInstance.address, ownerSigner);
    });

    it("has an employee address", async () => {
      const savedEmployee = await ethOwnerInstance.employee();
      assert.equal(savedEmployee, EMPLOYEE, "Employee is not properly set");
    });

    it("has an array of payments", async () => {
      const paymentsArrayLength = await ethOwnerInstance.payments.length;
      assert.equal(paymentsArrayLength, 0, "Payments array is not a zero length array")
    });

  })

  describe("Payment setup", () => {

    beforeEach(async () => {
      truffleInstance = await Payroll.new(EMPLOYEE);
      ethOwnerInstance = await createEthersContractAs(truffleInstance.address, ownerSigner);
      ethEmployeeInstance = await createEthersContractAs(truffleInstance.address, employeeSigner);
    });

    it("Can have a payment added", async () => {
      await ethOwnerInstance.addPayment(inOneWeek, {value});
      const payment = await ethOwnerInstance.payments(0);
      assert.equal(payment.dateAvailable, inOneWeek);
      assert.equal(payment.amount, value);
    });

    it("Must not allow non-owners to add payments", async () => {
      await assertRevert(ethEmployeeInstance.addPayment(inOneWeek, {value}), "Only the owner may do that");
    });

    it("Must not allow a invalid amount in payment", async () => {
      await assertRevert(ethOwnerInstance.addPayment(inOneWeek, {value: 0}), "An ether value must be sent with this payment");
    });

    it("Can have multiple payments added", async () => {
      await ethOwnerInstance.addPayment(inOneWeek, {value});
      await ethOwnerInstance.addPayment(toSeconds(addDays(new Date, 14)), {value});
      await ethOwnerInstance.addPayment(toSeconds(addDays(new Date, 21)), {value});

      const payment = await ethOwnerInstance.payments(2);
      assert.equal(payment.amount, value);
      const paymentsLength = await ethOwnerInstance.getPaymentsLength();

      assert.equal(paymentsLength.toNumber(), 3, "Payment length is not incremented");
    });

  });

  describe("Ether payments", () => {

    beforeEach(async () => {
      truffleInstance = await Payroll.new(EMPLOYEE);
      ethOwnerInstance = await createEthersContractAs(truffleInstance.address, ownerSigner);
      ethEmployeeInstance = await createEthersContractAs(truffleInstance.address, employeeSigner);
      await ethOwnerInstance.addPayment(yesterday, {value});
      await ethOwnerInstance.addPayment(inOneWeek, {value:7500});
      await ethOwnerInstance.addPayment(toSeconds(addDays(new Date, 14)), {value:8500});
      await ethOwnerInstance.addPayment(toSeconds(addDays(new Date, 21)), {value:9500});
    });

    it("allows employee to request funds for payment", async () => {
      const bn = await provider.getBlockNumber();
      const block = await provider.getBlock(bn);
      const paymentLengthBefore = await ethEmployeeInstance.getPaymentsLength();
      const paymentBefore = await ethEmployeeInstance.payments(2);

      await ethEmployeeInstance.requestPayment();

      const paymentAfter = await ethEmployeeInstance.payments(2);
      const paymentLengthAfter = await ethEmployeeInstance.getPaymentsLength();

      assert.equal(paymentBefore.amount.toNumber(), 8500, "Payments are not shifted correctly");
      assert.equal(paymentAfter.amount.toNumber(), 9500, "Payments are not shifted correctly");
      assert.equal(paymentLengthAfter.toNumber(), paymentLengthBefore.sub(1).toNumber(), "Length not properly reduced");
    });

    it("sends funds to the employee on request", async () => {
      const initialBalance = await provider.getBalance(EMPLOYEE);

      const {gasPrice, hash} = await ethEmployeeInstance.requestPayment();
      const {gasUsed} = await provider.getTransactionReceipt(hash);

      const newBalance = await provider.getBalance(EMPLOYEE);

      const expectedBalance = initialBalance.sub(gasUsed.mul(gasPrice)).add(value);

      assert.equal(expectedBalance.toString(), newBalance.toString(), "Sending balance is not correct");
    });

    it("triggers an event to show that the payment was claimed", async () => {
      const paymentEvent = new Promise((resolve, reject) => {
        ethEmployeeInstance.on('PaymentClaimed', (owner, employee, amount, event) => {
          event.removeListener();
          resolve({ owner, employee, amount: amount.toNumber() });
        });

        setTimeout(() => reject(new Error('timeout')), 10000)
      });
      await ethEmployeeInstance.requestPayment();

      const event = await paymentEvent;

      assert.equal(event.owner, OWNER);
      assert.equal(event.employee, EMPLOYEE);
      assert.equal(event.amount, value);
    });

    it("Does not return payment if there are none", async () => {
      await assertRevert(ethOwnerInstance.getPayment(5), "There are no matching payments");
    });

    it("Can retrieve an arbitrary payment's details", async () => {
      await ethOwnerInstance.addPayment(toSeconds(addDays(new Date, 28)), {value: 500});
      const length = await ethOwnerInstance.getPaymentsLength();
      const payment = await ethOwnerInstance.getPayment(length.sub(1).toNumber());

      assert.equal(payment.amount.toNumber(), 500);
    });
  });

  xdescribe("Stress Test", () => {
    it("can handle extreme numbers of payments", async () => {
      const additions = [];
      truffleInstance = await Payroll.new(EMPLOYEE);
      ethOwnerInstance = await createEthersContractAs(truffleInstance.address, ownerSigner);
      ethEmployeeInstance = await createEthersContractAs(truffleInstance.address, employeeSigner);
      additions.push(ethOwnerInstance.addPayment(yesterday, {value}));
      for (let i = 0; i <= 51; i++) {
        additions.push(ethOwnerInstance.addPayment(toSeconds(addDays(new Date, i*7)), {value}));
      }
      await Promise.all(additions);
      const paymentLengthBefore = await ethEmployeeInstance.getPaymentsLength();
      await ethEmployeeInstance.requestPayment();
      const paymentLengthAfter = await ethEmployeeInstance.getPaymentsLength();
      assert.equal(paymentLengthAfter.toNumber(), paymentLengthBefore.sub(1).toNumber(), "Length not properly reduced");
    });
  });

});



const createEthersContractAs = async (address, signer) => {
  const contract = new ethers.Contract(address, JSON.stringify(Payroll.abi), provider);
  return contract.connect(signer);
}

const cleanObject = array => {
  const newObj = {};
  for (let property in array) {
    if (isNaN(property)) {
      newObj[property] = array[property];
      if (newObj[property].constructor.name === 'BigNumber') {
        newObj[property] = newObj[property].toString();
      }
    }
  }
  return newObj;
}