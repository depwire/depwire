function direct() {}
function alpha() {}
function beta() {}
function property() {}
function assigned() {}
function mixed() {}
module.exports = direct;
module.exports = { alpha, beta };
module.exports.property = property;
exports.named = assigned;
Object.assign(module.exports, { mixed });
const key = 'dynamic';
module.exports[key] = mixed;
if (key) module.exports = mixed;
export const esm = () => {};
