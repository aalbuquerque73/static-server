'use strict';

const fs = require('fs');
const util = require('util');
const path = require('path');
const http = require('http');
const URL = require('url');

const internalCmdsPrototype = {
  addCmdAlias(alias) {
    this.alias = this.alias || [];
    alias.forEach(alias => this.alias.push(alias));
    return this;
  },
  setDefault(value) {
    this.default = value;
    this.value = value;
    return this;
  },
  setBoolean() {
    this.boolean = true;
    this.value = this.default || false;
    return this;
  },
  setCount() {
    this.counting = true;
    this.value = this.default || 0;
    return this;
  },
  setHelp() {
    this.showHelp = true;
    this._description = 'Show Help';
    return this;
  },
  setDescription(description) {
    this._description = description;
    return this;
  },
  setChoices(choices) {
    this.choices = this.choices || [];
    choices.forEach(choice => this.choices.push(choice));
    return this;
  },

  execute(nextArg, parent) {
    if (this.showHelp) {
      parent.showHelp = true;
      return false;
    }
    if (this.boolean) {
      this.value = !this.default;
      return false;
    }
    if (this.counting) {
      ++this.value;
      return false;
    }
    if (Array.isArray(this.choices) && this.choices.length > 0) {
      if (this.choices.indexOf(nextArg) > -1) {
        this.value = nextArg;
        return true;
      }
      return false;
    }
    this.value = nextArg;
    return true;
  },

  get description() {
    return this._description ? this._description : '';
  }
};

const ArgProccessing = {
  _internal: {
    cmds: {},

    initCmds(cmd) {
      this.cmds[cmd] = this.cmds[cmd] || Object.create(internalCmdsPrototype);
      return this.cmds[cmd];
    },

    process(argv) {
      const alias = {};
      for(let cmd in this.cmds) {
        Array.isArray(this.cmds[cmd].alias) && this.cmds[cmd].alias.forEach(a => alias[a] = cmd);
      }
      this.name = path.relative(process.cwd(), argv[1]);
      const args = argv.slice(2);
      let skipNext = false;
      args.forEach((arg, index) => {
        if (skipNext) {
          skipNext = false;
          return;
        }
        if (arg.slice(0, 2) === '--') {
          let cmd = arg.slice(2);
          if (alias.hasOwnProperty(cmd)) {
            cmd = alias[cmd];
          }
          if (this.cmds.hasOwnProperty(cmd)) {
            skipNext = his.cmds[cmd].execute(args[index + 1], this);
          }
          return;
        }
        if (arg.slice(0, 1) === '-') {
          let cmd = arg.slice(1);
          if (alias.hasOwnProperty(cmd)) {
            cmd = alias[cmd];
          }
          const cmds = cmd.split('');
          skipNext = cmds.reduce((v, cmd) => v || this.cmds.hasOwnProperty(cmd) && this.cmds[cmd].execute(args[index + 1], this), false);
        }
      });
      return this;
    },

    renderHelp() {
      console.log((this.message || '').replace('$0', this.name));
      console.log();
      console.log('Options:');
      const maxLength = Object.keys(this.cmds).reduce((prev, key) => {
        const cmd = this.cmds[key];
        const name = [key].concat(Array.isArray(cmd.alias) ? cmd.alias : []).map(key => `${key.length > 1 ? '--' : '-'}${key}`).join(', ');
        return Math.max(prev, name.length);
      }, 0);
      Object.keys(this.cmds).forEach(key => {
        const cmd = this.cmds[key];
        const name = [key].concat(Array.isArray(cmd.alias) ? cmd.alias : []).map(key => `${key.length > 1 ? '--' : '-'}${key}`).join(', ');
        const type = cmd.boolean ? '[boolean]' : '';
        const def = cmd.default ? `[default: ${cmd.default}]` : '';
        const choiceList = Array.isArray(cmd.choices) && cmd.choices.length > 0 ? cmd.choices.join('", "') : '';
        const choices = choiceList ? `[choices: ${choiceList}]` : '';
        const tag = `${choices}${def}${type}`;
        const spacing = 80 - maxLength - cmd.description.length - tag.length;
        console.log(name, ' '.repeat(maxLength - name.length), cmd.description, spacing > 0 ? ' '.repeat(spacing) : '', tag);
      });
    },

    get argv() {
      const argv = {};
      Object.keys(this.cmds).forEach(key => {
        const cmd = this.cmds[key];
        if (cmd.showHelp) {
          return;
        }
        Array.isArray(cmd.alias) && cmd.alias.forEach(alias => argv[alias] = cmd.value);
        argv[key] = cmd.value;
      });
      return argv;
    }
  },

  usage(message) {
    this._internal.message = message;
    return this;
  },
  alias(cmd, ...alias) {
    this._internal.initCmds(cmd).addCmdAlias(alias);
    return this;
  },
  default(cmd, value) {
    this._internal.initCmds(cmd).setDefault(value);
    return this;
  },
  count(cmd) {
    this._internal.initCmds(cmd).setCount();
    return this;
  },
  help(cmd) {
    this._internal.initCmds(cmd).setHelp();
    return this;
  },
  describe(cmd, description) {
    this._internal.initCmds(cmd).setDescription(description);
    return this;
  },
  choices(cmd, choices) {
    this._internal.initCmds(cmd).setChoices(choices);
    return this;
  },

  get argv() {
    this._internal.process(process.argv);
    if (this._internal.showHelp) {
      this._internal.renderHelp();
      process.exit();
    }
    return this._internal.argv;
  }
};

const argv = ArgProccessing
    .usage('Usage: $0 [options]')
    .alias('p', 'port')
    .default('p', 8080)
    .describe('p', 'port to use')
    .help('h')
    .alias('h', 'help')
    .count('v')
    .alias('v', 'verbose')
    .alias('l', 'log')
    .describe('l', 'log level')
    .choices('l', ['debug', 'info', 'warn', 'error'])
    .default('l', 'warn')
    .default('path', './')
    .default('e404', 'index.html')
    .argv;

const logger = {
    levels: ['debug', 'info', 'warn', 'error', 'critical'],

    init() {
        this.level = this.levelCode(argv.l);
        if (argv.v > 0) {
            this.level = Math.max(this.levels.length - argv.v - 1, 0);
        }

        this.write = (level, ...args) => {
            let levelCode = ((this.levelCode(level) + 1) || 2) - 1;
            if (levelCode >= this.level) {
                console.log.apply(console, [`${this.levels[levelCode]}:`].concat(args));
            }
        };

        this.debug = (...args) => {
            this.write('debug', ...args);
        };
        this.debug.log = (...args) => {
            return () => {
                this.debug(...args);
            };
        };

        this.log = this.info = (...args) => {
            this.write('info', ...args);
        };
        this.log.log = this.info.log = (...args) => {
            return () => {
                this.info(...args);
            };
        };

        this.warn = (...args) => {
            this.write('warn', ...args);
        };
        this.warn.log = (...args) => {
            return () => {
                this.warn(...args);
            };
        };

        this.error = (...args) => {
            this.write('error', ...args);
        };
        this.error.log = (...args) => {
            return () => {
                this.error(...args);
            };
        };

        this.critical = (...args) => {
            this.write('critical', ...args);
        };
        this.critical.log = (...args) => {
            return () => {
                this.critical(...args);
            };
        };
    },

    levelCode(level) {
        return this.levels.indexOf(level);
    }
};

const staticBasePath = argv.path;

function staticServe(req, res) {
    const url = URL.parse(req.url);
    let baseLoc = path.resolve(staticBasePath);
    let fileLoc = path.join(baseLoc, url.pathname);
    let type = fileLoc.split('.').pop();
    let statusCode = 200;
    logger.log(`Request ${url.pathname} file`);

    let mimeTypes = {
        'css': 'text/css',
        'html': 'text/html',
        'js': 'text/javascript',
        'jpg': 'image/jpg',
        'png': 'image/png',
        'svg': 'image/svg+xml'
    };

    if (fs.existsSync(fileLoc)) {
        if (fs.lstatSync(fileLoc).isDirectory()) {
            fileLoc = path.join(fileLoc, 'index.html');
        }
    } else {
        statusCode = 404;
        logger.warn(`${url.pathname} not found!`);
        fileLoc = path.join(baseLoc, argv.e404);
    }

    let stream = fs.createReadStream(fileLoc);

    stream.on('error', (error) => {
        res.writeHead(404, 'Not Found');
        res.write('<p>404: File not found!</p>');
        res.write(`<p>${error}</p>`);
        res.end();
    });

    res.statusCode = statusCode;
    if (mimeTypes.hasOwnProperty(type)) {
        res.setHeader('Content-Type', mimeTypes[type]);
    }
    stream.pipe(res);
}

logger.init();
http.createServer(staticServe).listen(argv.p, logger.info.log('Server has started'));
