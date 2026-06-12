const STATUS = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE'
};

let currentTask = null;
let status = STATUS.IDLE;

function start(task) {
  currentTask = task;
  status = STATUS.RUNNING;
}

function stop() {
  currentTask = null;
  status = STATUS.IDLE;
}

async function tick(bot) {
  if (!currentTask) return status;

  status = await currentTask.run(bot);

  if (status === STATUS.SUCCESS || status === STATUS.FAILURE) {
    currentTask = null;
  }

  return status;
}

function getStatus() {
  return status;
}

module.exports = { start, stop, tick, getStatus, STATUS };