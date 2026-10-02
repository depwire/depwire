function called() {}
module.exports = function inline() { called(); };
exports.extra = () => called();
