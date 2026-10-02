function conditional() {}
function computed() {}
if (process.env.MODE) module.exports = conditional;
module.exports[process.env.KEY] = computed;
if (process.env.MODE) exports.dynamic = function dynamic() {};
