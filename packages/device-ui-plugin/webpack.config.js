var webConfig = {
  entry: './src/device-ui-plugin.js',
  output: {
    filename: './device-ui-plugin.web.js',
    library: 'DeviceUI',
    libraryTarget: 'var'
  },
  module:{
    loaders: [
      { test: /\.(png|woff|woff2|eot|ttf|svg)$/, loader: 'url-loader?limit=100000' }
    ]
  }
};

module.exports = webConfig;
