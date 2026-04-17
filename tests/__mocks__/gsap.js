const timeline = () => ({
  to() { return this; },
  kill() {},
});
module.exports = {
  default: { timeline },
  timeline,
};
