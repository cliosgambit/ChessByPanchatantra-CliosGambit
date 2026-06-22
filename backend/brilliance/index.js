const { mountLichessPgnsRoutes } = require('./routes/lichessPgns');

function mountBrillianceRoutes(app) {
  mountLichessPgnsRoutes(app);
}

module.exports = { mountBrillianceRoutes };
