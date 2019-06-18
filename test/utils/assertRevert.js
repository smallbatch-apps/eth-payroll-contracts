const assertRevert = async (promise, message = 'VM Exception') => {
  try {
    await promise;
    assert.fail("Expected exception not found");
  } catch (e) {
    if(e.message === "Expected exception not found") {
      assert.fail("Expected exception not found");
    } else {
      assert.include(e.message, message);
    }
  }
};

module.exports = assertRevert;