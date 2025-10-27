const winston = require('winston');

/**
 * Creates a logger with specified configuration.
 * @param   {object} argv - The command line arguments.
 * @returns {object}      - The created logger instance.
 */
function createLogger(argv) {
  /** @type {any[]} */
  const transports = [new winston.transports.Console()];

  if (argv.logfile) {
    transports.push(new winston.transports.File({ filename: argv.logfile }));
  }

  return winston.createLogger({
    level: argv.loglevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(
        ({ timestamp, level, message }) =>
          `${timestamp} [${level}]: ${message}`,
      ),
    ),
    transports: transports,
  });
}

module.exports = createLogger;
