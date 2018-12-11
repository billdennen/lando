'use strict';

// Modules
const _ = require('lodash');
const esc = require('shell-escape');
const Shell = require('./shell');
const shell = new Shell();
const escSpaces = shell.escSpaces;

// Helper object for flags
const composeFlags = {
  background: '-d',
  detach: '-d',
  environment: '-e',
  follow: '--follow',
  force: '--force',
  noCache: '--no-cache',
  noRecreate: '--no-recreate',
  noDeps: '--no-deps',
  pull: '--pull',
  q: '-q',
  recreate: '--force-recreate',
  removeOrphans: '--remove-orphans',
  rm: '--rm',
  timestamps: '--timestamps',
  volumes: '-v',
};

// Default options
const defaultOptions = {
  build: {noCache: false, pull: true},
  down: {removeOrphans: true, volumes: true},
  exec: {detach: false},
  kill: {},
  logs: {follow: false, timestamps: false},
  ps: {q: true},
  pull: {},
  rm: {force: true, volumes: true},
  up: {background: true, noRecreate: true, recreate: false, removeOrphans: true},
};

/*
 * Helper to merge options with default
 */
const mergeOpts = (run, opts = {}) => _.merge({}, defaultOptions[run], opts);

/*
 * Parse entrypoint
 */
const parseEntrypoint = entrypoint => (_.isArray(entrypoint)) ? escSpaces(entrypoint.join(' ')) : entrypoint;

/*
 * Parse docker-compose options
 */
const parseOptions = (opts = {}) => {
  const flags = _.map(composeFlags, (value, key) => _.get(opts, key, false) ? value : '');
  const environment = _.flatten(_.map(opts.environment, variable => ['-e', variable]));
  const user = (_.has(opts, 'user')) ? ['--user', opts.user] : [];
  const entrypoint = _.map(opts.entrypoint, entrypoint => ['--entrypoint', parseEntrypoint(entrypoint)]);
  return _.compact(_.flatten([flags, environment, user, entrypoint]));
};

/*
 * Helper to standardize construction of docker commands
 */
const buildCmd = (run, name, compose, {services, cmd}, opts = {}) => {
  if (!name) throw new Error('Need to give this composition a project name!');
  // @TODO: we need to strip out opts.user on start/stop because we often get it as part of run
  const project = ['--project-name', name];
  const files = _.flatten(_.map(compose, unit => ['--file', unit]));
  const options = parseOptions(opts);
  const argz = _.flatten(_.compact([services, cmd]));
  return _.flatten([project, files, run, options, argz]);
};

/*
 *  Helper to build build object needed by lando.shell.sh
 */
const buildShell = (run, name, compose, opts = {}, mode = 'collect') => ({
  cmd: buildCmd(run, name, compose, {services: opts.services, cmd: opts.cmd}, mergeOpts(run, opts)),
  opts: {mode},
});

/*
 * Run docker compose build
 */
exports.build = (compose, project, opts = {}) => buildShell('build', project, compose, opts);

/*
 * Run docker compose pull
 */
exports.getId = (compose, project, opts = {}) => buildShell('ps', project, compose, opts, 'exec');

/*
 * Run docker compose logs
 */
exports.logs = (compose, project, opts = {}) => buildShell('logs', project, compose, opts, 'attach');

/*
 * Run docker compose pull
 */
exports.pull = (compose, project, opts = {}) => {
  // Let's get a list of all our services that need to be pulled eg not built from a local dockerfile
  const allServices = _.keys(_.get(opts, 'app.services', {}));
  const images = _.filter(allServices, service => !_.has(opts.app.services, service + '.build'));
  // If the user has selected something then intersect, if not use all image driven services
  opts.services = (!_.isEmpty(opts.services)) ? _.intersection(opts.services, images) : images;
  // Pull
  return buildShell('pull', project, compose, opts);
};

/*
 * Run docker compose remove
 */
exports.remove = (compose, project, opts = {}) => {
  const subCmd = (opts.purge) ? 'down' : 'rm';
  return buildShell(subCmd, project, compose, opts);
};

/*
 * Run docker compose run
 */
exports.run = (compose, project, opts = {}) => {
  // Make cmd is an array lets desconstruct and escape
  if (_.isArray(opts.cmd)) opts.cmd = escSpaces(esc(opts.cmd), 'linux');
  // Add in any prefix commands
  if (_.has(opts, 'pre')) opts.cmd = [opts.pre, opts.cmd].join('&&');
  // Remake command
  opts.cmd = ['/bin/sh', '-c', opts.cmd];
  // Reset services based on the ID
  opts.services = [opts.id.split('_')[1]];
  // Build the command
  return buildShell('exec', project, compose, opts, 'attach');
};

/*
 * You can do a create, rebuild and start with variants of this
 */
exports.start = (compose, project, opts = {}) => buildShell('up', project, compose, opts);

/*
 * Run docker compose Kill
 * @NOTE: we use kill for speeeeeedzzz
 */
exports.stop = (compose, project, opts = {}) => buildShell('kill', project, compose, opts);