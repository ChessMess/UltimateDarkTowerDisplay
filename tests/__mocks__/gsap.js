const tweens = [];
const timelines = [];

function makeTween(target, vars) {
  const tween = {
    target,
    vars,
    killed: false,
    kill() { this.killed = true; },
  };
  tweens.push(tween);
  return tween;
}

function makeTimeline() {
  const tl = {
    killed: false,
    to() { return tl; },
    kill() { tl.killed = true; },
  };
  timelines.push(tl);
  return tl;
}

const gsap = {
  to: (target, vars) => makeTween(target, vars),
  timeline: makeTimeline,
};

module.exports = {
  default: gsap,
  ...gsap,
  __getTweens() { return tweens; },
  __getTimelines() { return timelines; },
  __reset() { tweens.length = 0; timelines.length = 0; },
};
