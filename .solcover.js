module.exports = {
  enableTimeouts: false,
  configureYulOptimizer: true,
  skipFiles: [
    'mocks/ArchimedesAPIMock.sol',
    'mocks/ArchimedesMock.sol',
    'mocks/BridgedPiTokenMock.sol',
    'mocks/CurvePoolMock.sol',
    'mocks/CurveRewardsGaugeMock.sol',
    'mocks/DataProviderMock.sol',
    'mocks/DistributorMock.sol',
    'mocks/FarmMock.sol',
    'mocks/IncentivesControllerMock.sol',
    'mocks/PiTokenMock.sol',
    'mocks/PoolMock.sol',
    'mocks/PriceFeedMock.sol',
    'mocks/TestNetMint.sol',
    'mocks/TokenMock.sol',
    'mocks/UniswapRouterMock.sol',
    'mocks/WETHMock.sol',
    'ControllerLPWithoutStrat.sol',
    'PiOracle.sol',
    'UniZap.sol'
  ]
}
