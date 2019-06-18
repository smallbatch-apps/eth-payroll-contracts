pragma solidity 0.5.8;
pragma experimental ABIEncoderV2;

contract Payroll {

	address payable public employee;
	address public owner;
	uint public initialAmount;
	string public projectId;

	uint8 public approvalIndex;
	uint8 public paymentPercentage;

	bool public ownerCompleted;

	struct Payment {
		uint256 dateAvailable;
		uint256 amount;
	}

	Payment[] public payments;

	event PaymentAdded(address indexed employee, uint amount);
	event PaymentClaimed(address indexed owner, address indexed employee, uint amount);

	constructor (address payable _employee) public payable {
		employee = _employee;
		owner = msg.sender;
	}

	function addPayment(uint256 _dateAvailable) public payable {
		require(msg.sender == owner, "Only the owner may do that");
		require(msg.value > 0, "An ether value must be sent with this payment");

		payments.push(Payment({
			dateAvailable: _dateAvailable,
			amount: msg.value
		}));

		emit PaymentAdded(employee, msg.value);
	}

	function requestPayment() public {
		require(msg.sender == employee, "Only the employee may do that");
		require(payments[0].dateAvailable < block.timestamp, "Payment is not yet due");

		uint amount = payments[0].amount;

		for (uint i = 0; i < payments.length; i++) {
			if (i > 0) {
				payments[i-1] = payments[i];
			}
		}
		payments.length--;

		employee.transfer(amount);

		emit PaymentClaimed(owner, employee, amount);
	}

	function getCurrentBalance() public view returns(uint) {
		return address(this).balance;
	}

	function getPayment(uint _index) public view returns (Payment memory payment) {
		require(_index < payments.length, "There are no matching payments");
		payment = payments[_index];
	}

	function getPaymentsLength() public view returns (uint length) {
  	length = payments.length;
  }

}
