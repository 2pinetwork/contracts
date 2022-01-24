const chai = require('chai')
const expect = chai.expect 
const { deployMockContract } = require("ethereum-waffle");
const { isBytes } = require("ethers/lib/utils");
const { wallfe, ethers } = require("hardhat");
const ZERO_ADDRESS = ethers.constants.AddressZero;
const MOCK_ADDRESS = '0x' + '1'.repeat(40)
const MOCK_ADDRESSV2 = '0x' + '2'.repeat(40)
const MockPiToken = require("../../artifacts/contracts/auditMocs/IMockPiToken.sol/IMockPiToken.json")
const Archimedes = require("../../artifacts/contracts/Archimedes.sol/Archimedes.json");
const Strategy = require("../../artifacts/interfaces/IStrategy.sol/IStrategy.json");
const Controller = require("../../artifacts/contracts/Controller.sol/Controller.json");
const DataProvider = require("../../artifacts/contracts/mocks/DataProviderMock.sol/DataProviderMock.json")
const { smock } = require("@defi-wonderland/smock");
chai.use(smock.matchers);


describe("ControllerAaveStrat", async()=>{

    before(async()=>{
        this.signers = await ethers.getSigners();
        aliceAccount = this.signers[0];
        bobAccount = this.signers[1];
        carolAccount = this.signers[2];
        eveAccount = this.signers[3];
        feiAccount = this.signers[4];
        devidAccount = this.signers[5];
        alice = aliceAccount.address;
        bob = bobAccount.address;
        carol = carolAccount.address;
        eve = eveAccount.address;
        fei = feiAccount.address;
        devid = devidAccount.address;
        this.Controller = await ethers.getContractFactory("ControllerAaveStrat");
    })

    it("deploy want fail address zero", async()=>{
        await expect(this.Controller.deploy(ZERO_ADDRESS, 0, 0,0,0, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS)).to.be.revertedWith("want !ZeroAddress");
    })

    it("deploy controller fail address zero", async()=>{
        await expect(this.Controller.deploy(MOCK_ADDRESS, 0, 0,0,0, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS)).to.be.revertedWith("Controller !ZeroAddress");
    })

    it("deploy treasury fail address zero", async()=>{
        await expect(this.Controller.deploy(MOCK_ADDRESS, 0, 0,0,0, MOCK_ADDRESS, MOCK_ADDRESS, ZERO_ADDRESS)).to.be.revertedWith("Treasury !ZeroAddress");
    })

    it("deploy borrow rate bigger then borrow rate max fail", async()=>{
        await expect(this.Controller.deploy(MOCK_ADDRESS, 1, 0,0,0, MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS)).to.be.revertedWith("!Borrow <= MaxBorrow");
    })

    it("deploy borrow rate max bigger then ratio precision  fail", async()=>{
        await expect(this.Controller.deploy(MOCK_ADDRESS, 1, 100000,0,0, MOCK_ADDRESS, ZERO_ADDRESS, MOCK_ADDRESS)).to.be.revertedWith("!MaxBorrow <= 100%");
    })

    it("deploy works", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, ZERO_ADDRESS, MOCK_ADDRESS);
        const want = await ctrlAave.want();
        expect(want).to.be.equal(MOCK_ADDRESS);
    })

    it("call set treasury, fail  same address", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, ZERO_ADDRESS, MOCK_ADDRESS);
        const trs = await ctrlAave.treasury();
        await expect(ctrlAave.setTreasury(trs)).to.be.revertedWith("Same address");
    })

    it("call set treasury, fail zero address", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, ZERO_ADDRESS, MOCK_ADDRESS);
        const trs = await ctrlAave.treasury();
        await expect(ctrlAave.setTreasury(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress");
    })

    it("call set treasury, works", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, ZERO_ADDRESS, MOCK_ADDRESS);
        const oldTrs = await ctrlAave.treasury();
        await expect(ctrlAave.setTreasury(MOCK_ADDRESSV2)).to.emit(ctrlAave, "NewTreasury").withArgs(MOCK_ADDRESS, MOCK_ADDRESSV2);
        const trs = await ctrlAave.treasury();
        expect(trs).to.not.be.equal(MOCK_ADDRESS);
        expect(trs).to.be.equal(MOCK_ADDRESSV2);
    })

    it("call set exchange, fail same address", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrlAave.setExchange(MOCK_ADDRESS)).to.be.revertedWith("Same address");
     
    })

    it("call set exchange, fail zero address", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrlAave.setExchange(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress");
    })

    it("call set exchange, works", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const oldex = await ctrlAave.exchange();
        await expect(ctrlAave.setExchange(MOCK_ADDRESSV2)).to.emit(ctrlAave, "NewExchange").withArgs(MOCK_ADDRESS, MOCK_ADDRESSV2);
        const ex = await ctrlAave.exchange();
        expect(ex).to.not.be.equal(oldex);
        expect(ex).to.be.equal(MOCK_ADDRESSV2);
    })

    it("call set swap route, fail route[0] is not wnative", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const wnative = await ctrlAave.wNative();
        await expect(ctrlAave.setSwapRoute([MOCK_ADDRESS, wnative])).to.be.revertedWith("route[0] isn't wNative")
    })

    it("call set swap route, fail last route is not want", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const wnative = await ctrlAave.wNative();
        await expect(ctrlAave.setSwapRoute([wnative, MOCK_ADDRESS, MOCK_ADDRESSV2])).to.be.revertedWith("Last route isn't want")
    })

    it("call set swap route, works", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const wnative = await ctrlAave.wNative();
        await ctrlAave.setSwapRoute([wnative, MOCK_ADDRESS])
        const _wn = await ctrlAave.wNativeToWantRoute(0);
        const _mw = await ctrlAave.wNativeToWantRoute(1);
        expect(_wn).to.be.equal(wnative);
        expect(_mw).to.be.equal(MOCK_ADDRESS);
    })

    it("call performance fee, fail same address", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const performanceFee = await ctrlAave.performanceFee();
        await expect(ctrlAave.setPerformanceFee(performanceFee)).to.be.revertedWith("Same fee");
    })

    it("call set ratio for full withdraw, same ratio", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const ratio = await ctrlAave.ratioForFullWithdraw();
        await expect(ctrlAave.setRatioForFullWithdraw(ratio)).to.be.revertedWith("Same ratio")
    })

    it("call set ratio for full withdraw, fail more then 100%", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const ratio = await ctrlAave.ratioForFullWithdraw();
        await expect(ctrlAave.setRatioForFullWithdraw(100000)).to.be.revertedWith("Can't be more than 100%");
    })

    it("call set ratio for full withdraw, works", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrlAave.setRatioForFullWithdraw(1);
        const ratio = await ctrlAave.ratioForFullWithdraw();
        expect(ratio.toString()).to.be.equal("1");
    })

    it("call performance fee, fail more then 100%", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrlAave.setPerformanceFee(100000)).to.be.revertedWith("Can't be greater than max");
     
    })

    it("call performance fee, works", async()=>{
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        const ctrlAave = await this.Controller.deploy(MOCK_ADDRESS, 1, 100,0,0, MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const performanceFee = await ctrlAave.performanceFee();
        await expect(ctrlAave.setPerformanceFee(455)).to.emit(ctrlAave ,"NewPerformanceFee").withArgs( performanceFee.toString(), "455");
     
    })

    it("should call before movement", async()=>{
        const MockController = await ethers.getContractFactory("ControllerCallAaveStrat");
        const mockController = await MockController.deploy();
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(2);
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
    
        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.DATA_PROVIDER.returns(dataProviderFake.address);
        await expect(mockController.mockCallBeforeMovementOnAaveStrat(mockCtrlAave.address, {from:alice, gasLimit: 30000000})).to.not.emit(mockCtrlAave, "PerformanceFee");
    })


    it("should call before movement, fee biggern then 0", async()=>{
        const MockController = await ethers.getContractFactory("ControllerCallAaveStrat");
        const mockController = await MockController.deploy();
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(20000);
        await mockPiToken.mock.transfer.returns(true);
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
    
        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(mockController.mockCallBeforeMovementOnAaveStrat(mockCtrlAave.address, {from:alice, gasLimit: 30000000})).to.emit(mockCtrlAave, "PerformanceFee");
    })

    it("should call before movement, currrent balance smmaller then last balance", async()=>{
        
        const MockController = await ethers.getContractFactory("ControllerCallAaveStrat");
        const mockController = await MockController.deploy();
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(20000);
        await mockPiToken.mock.transfer.returns(true);
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        
        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.setVariable("lastBalance", 200000)
        await expect(mockController.mockCallBeforeMovementOnAaveStrat(mockCtrlAave.address, {from:alice, gasLimit: 30000000})).to.not.emit(mockCtrlAave, "PerformanceFee");
    })

    it("should call before movement, perfFee biggern then balance", async()=>{
        const MockController = await ethers.getContractFactory("ControllerCallAaveStrat");
        const mockController = await MockController.deploy();
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(20000);
        await mockPiToken.mock.transfer.returns(true);
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        
        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.setVariable("performanceFee", 2000000)
        await expect(mockController.mockCallBeforeMovementOnAaveStrat(mockCtrlAave.address, {from:alice, gasLimit: 30000000})).to.emit(mockCtrlAave, "PerformanceFee");
    })

    it("should call deposit, minLeverage smaller then amount ", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(20000);
        await mockPiToken.mock.transfer.returns(true);
        await mockPiToken.mock.approve.returns(true);
        await mockPiToken.mock.allowance.returns(0);
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        
        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await mockCtrlAave.connect(mockController.wallet).deposit()
        expect(poolMockFake.deposit).to.have.callCount(1);
    })

    it("should call deposit , minLeverage bigger then amount", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(20000);
        await mockPiToken.mock.transfer.returns(true);
        await mockPiToken.mock.approve.returns(true);
        await mockPiToken.mock.allowance.returns(0);
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        
        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await mockCtrlAave.setVariable("minLeverage", 200000)
        await mockCtrlAave.connect(mockController.wallet).deposit()
        expect(poolMockFake.deposit).to.have.callCount(1);

    })

    it("should call deposit, minLeverage smaller then amount, borrowDepth 1000 ", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(20000);
        await mockPiToken.mock.transfer.returns(true);
        await mockPiToken.mock.approve.returns(true);
        await mockPiToken.mock.allowance.returns(0);
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        
        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.setVariable("borrowDepth", 1000)

        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await mockCtrlAave.connect(mockController.wallet).deposit()
        expect(poolMockFake.deposit).to.have.callCount(1001);

    })

    it("should call withdraw, balance bigger then amount ", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(20000);
        await mockPiToken.mock.transfer.returns(true);
        await mockPiToken.mock.approve.returns(true);
        await mockPiToken.mock.allowance.returns(0);
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        
        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);

        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await mockCtrlAave.connect(mockController.wallet).withdraw(0)
        expect(poolMockFake.deposit).to.have.callCount(1);
    })

    it("should call withdraw, balance lower then amount, borrow balance equal 0 ", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(20000);
        await mockPiToken.mock.transfer.returns(true);
        await mockPiToken.mock.approve.returns(true);
        await mockPiToken.mock.allowance.returns(0);
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        
        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);

        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await mockCtrlAave.connect(mockController.wallet).withdraw(20001)
        expect(poolMockFake.deposit).to.have.callCount(1);

    })

    it("should call withdraw, full deleverage path ", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(20000);
        await mockPiToken.mock.transfer.returns(true);
        await mockPiToken.mock.approve.returns(true);
        await mockPiToken.mock.allowance.returns(0);
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getUserReserveData.returnsAtCall(0,['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(1, ['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(2, ['100000000000000000000', 0, 0, 0, 0, 0, 0, 0, false]);


        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "10000000000000000000"])
        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);

        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await mockCtrlAave.connect(mockController.wallet).withdraw("520001000000000000000000000")
        expect(dataProviderFake.getUserReserveData).to.have.callCount(4);

    })

    it("should call withdraw, partial deleverage path, not go into while, toWithdraw smaller then wantBalance ", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");

        const mockPiToken = await smock.fake(_MockPiToken);
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,200000);

        await mockPiToken.transfer.returns(true);
        await mockPiToken.approve.returns(true);
        await mockPiToken.allowance.returns(0);
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getUserReserveData.returnsAtCall(0,['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(1, ['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(2, ['100000000000000000000', 0, 0, 0, 0, 0, 0, 0, false]);


        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "200000000000000000000"])
        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);

        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await mockCtrlAave.connect(mockController.wallet).withdraw("20001")
        expect(dataProviderFake.getUserReserveData).to.have.callCount(2);

    })


    it("should call withdraw, partial deleverage path, go into while, go into withdraw and repay ", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");

        const mockPiToken = await smock.fake(_MockPiToken);
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);


        await mockPiToken.transfer.returns(true);
        await mockPiToken.approve.returns(true);
        await mockPiToken.allowance.returns(0);
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getUserReserveData.returnsAtCall(0,['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(1, ['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(2, ['100000000000000000000', 0, 0, 0, 0, 0, 0, 0, false]);


        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "200000000000000000000"])
        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);

        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await mockCtrlAave.connect(mockController.wallet).withdraw("20001")
        expect(dataProviderFake.getUserReserveData).to.have.callCount(3);

    })

    it("should call increase health factor, by ration bigger then 100%", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken);
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);


        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(mockCtrlAave.connect(aliceAccount).increaseHealthFactor(10001)).to.be.revertedWith("Can't be more than 100%");

    })


    it("should call increase health factor, borrow balance smaller then 0", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken);
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);

        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "1000000000000000000"])

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.supplyAndBorrow.returns([1,1]);
        await mockCtrlAave.connect(aliceAccount).increaseHealthFactor(10000);
        expect(poolMockFake.withdraw).to.have.callCount(1);

    })

    it("should call increase health factor, borrow balance bigger then 0, toWithdraw 0", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken);
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);
        await mockPiToken.approve.returns(true);
        

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);
        await dataProviderFake.getUserReserveData.returns([0, 0, 1, 0, 0, 0, 0, 0, false]);

        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "1000000000000000000"])

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.connect(aliceAccount).increaseHealthFactor(10000);
        expect(poolMockFake.repay).to.have.callCount(1);

    })


    it("should call increase health factor, borrow balance bigger then 0, toWithdraw bigger then 0", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken);
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);
        await mockPiToken.approve.returns(true);
        

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);
        await dataProviderFake.getUserReserveData.returns(["10000000000000000000000", 0, 1, 0, 0, 0, 0, 0, false]);

        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "100000000000000000000"])

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.connect(aliceAccount).increaseHealthFactor(10000);
        expect(poolMockFake.repay).to.have.callCount(1);


    })

    it("should call rebalance, fail exceeds max borrow rate", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken);
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);
        await mockPiToken.approve.returns(true);
        

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);
        await dataProviderFake.getUserReserveData.returns(["10000000000000000000000", 0, 1, 0, 0, 0, 0, 0, false]);

        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "100000000000000000000"])

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.setVariable("borrowRateMax", 1);
        await expect(mockCtrlAave.connect(aliceAccount).rebalance(10000,0)).to.be.revertedWith("Exceeds max borrow rate");
    })

    it("should call rebalance, fail exceeds max borrow depth", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken);
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);
        await mockPiToken.approve.returns(true);
        

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);
        await dataProviderFake.getUserReserveData.returns(["10000000000000000000000", 0, 1, 0, 0, 0, 0, 0, false]);

        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "100000000000000000000"])

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.setVariable("borrowRateMax", 1);
        await expect(mockCtrlAave.connect(aliceAccount).rebalance(0,11)).to.be.revertedWith("Exceeds max borrow depth");
    })

    it("should call rebalance, works not go into last if", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken);
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);
        await mockPiToken.approve.returns(true);
        

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);
        await dataProviderFake.getUserReserveData.returnsAtCall(0,['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(1, ['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(2, ['100000000000000000000', 0, 0, 0, 0, 0, 0, 0, false]);

        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "100000000000000000000"])

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.setVariable("borrowRateMax", 1);
        await mockCtrlAave.connect(aliceAccount).rebalance(0,8);
        expect(dataProviderFake.getUserReserveData).to.have.callCount(3);
    })

    it("should call rebalance, works not go last if", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken);
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);
        await mockPiToken.approve.returns(true);
        

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);
        await dataProviderFake.getUserReserveData.returnsAtCall(0,['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(1, ['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(2, ['100000000000000000000', 0, 0, 0, 0, 0, 0, 0, false]);

        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "100000000000000000000"])

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.setVariable("borrowRateMax", 1);
        await mockCtrlAave.connect(aliceAccount).pause();
        await mockCtrlAave.connect(aliceAccount).rebalance(0,8);
        expect(dataProviderFake.getUserReserveData).to.have.callCount(3);

    })

    it("should call panic, works", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken);
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);
        await mockPiToken.approve.returns(true);
        

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);
        await dataProviderFake.getUserReserveData.returnsAtCall(0,['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(1, ['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(2, ['100000000000000000000', 0, 0, 0, 0, 0, 0, 0, false]);

        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "100000000000000000000"])

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.connect(aliceAccount).panic();
        expect(dataProviderFake.getUserReserveData).to.have.callCount(3);

    })

    it("should call retire strategy, works", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken, {address: "0xdB82Ca63dcC9fD42c71A74D9fa45A35117F45B7F"});
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);
        await mockPiToken.approve.returns(true);
        await mockPiToken.transfer.returns(true);
        

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);
        await dataProviderFake.getUserReserveData.returnsAtCall(0,['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(1, ['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(2, ['100000000000000000000', 0, 0, 0, 0, 0, 0, 0, false]);

        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "100000000000000000000"])

        const IncncCtrl = await ethers.getContractFactory("IncentivesControllerMock");
        const incentivesController = await smock.fake(IncncCtrl, { address: "0xC469e7aE4aD962c30c7111dc580B4adbc7E914DD"});


        const WNMock = await ethers.getContractFactory("WETHMock");
        const wnative = await smock.fake(WNMock, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await wnative.balanceOf.returns(1);
        await wnative.approve.returns(true);

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStratV2");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })

        const PriceFeedMock = await ethers.getContractFactory("PriceFeedMock");
        const priceFeedMock= await smock.fake(PriceFeedMock);


        const UniswapRouterMock = await ethers.getContractFactory("UniswapRouterMock");
        const uniswapRouterMock = await smock.fake(UniswapRouterMock);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])

        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await mockCtrlAave.setVariable("oracles", {
            "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f": priceFeedMock.address,
        })


        await mockCtrlAave.setVariable("oracles", {
            "0xdB82Ca63dcC9fD42c71A74D9fa45A35117F45B7F" : priceFeedMock.address,
        })

        await mockCtrlAave.setVariable("exchange", uniswapRouterMock.address);
        
        await mockCtrlAave.connect(mockController.wallet).retireStrat();
        expect(dataProviderFake.getUserReserveData).to.have.callCount(8);

    })

    it("should call swap rewards internal function", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken, {address: "0xdB82Ca63dcC9fD42c71A74D9fa45A35117F45B7F"});
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);
        await mockPiToken.approve.returns(true);
        await mockPiToken.transfer.returns(true);
        

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);
        await dataProviderFake.getUserReserveData.returnsAtCall(0,['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(1, ['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(2, ['100000000000000000000', 0, 0, 0, 0, 0, 0, 0, false]);

        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "100000000000000000000"])

        const IncncCtrl = await ethers.getContractFactory("IncentivesControllerMock");
        const incentivesController = await smock.fake(IncncCtrl, { address: "0xC469e7aE4aD962c30c7111dc580B4adbc7E914DD"});


        const WNMock = await ethers.getContractFactory("WETHMock");
        const wnative = await smock.fake(WNMock, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await wnative.balanceOf.returns(1);
        await wnative.approve.returns(true);

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStratV2");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })

        const PriceFeedMock = await ethers.getContractFactory("PriceFeedMock");
        const priceFeedMock= await smock.fake(PriceFeedMock);


        const UniswapRouterMock = await ethers.getContractFactory("UniswapRouterMock");
        const uniswapRouterMock = await smock.fake(UniswapRouterMock);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])

        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await mockCtrlAave.setVariable("oracles", {
            "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f": priceFeedMock.address,
        })


        await mockCtrlAave.setVariable("oracles", {
            "0xdB82Ca63dcC9fD42c71A74D9fa45A35117F45B7F" : priceFeedMock.address,
        })

        await mockCtrlAave.setVariable("exchange", uniswapRouterMock.address);
        
        await mockCtrlAave.connect(mockController.wallet).mockCallSwapRewards();
        expect(uniswapRouterMock.swapExactTokensForTokens).to.have.callCount(1);
    })


    it("call charge fees, not go into if", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);


        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);


        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken, {address: "0xdB82Ca63dcC9fD42c71A74D9fa45A35117F45B7F"});

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStratV2");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.setVariable("performanceFee", 1);
        await mockCtrlAave.mockCallChargeFees(1);
        expect(mockPiToken.transfer).to.have.callCount(0);
    })

    it("call charge fees, go into if", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);


        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);


        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken, {address: "0xdB82Ca63dcC9fD42c71A74D9fa45A35117F45B7F"});
        await mockPiToken.transfer.returns(true);

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStratV2");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await mockCtrlAave.setVariable("performanceFee", 10000);
        await mockCtrlAave.mockCallChargeFees(10000);
        expect(mockPiToken.transfer).to.have.callCount(1);

    })

    it("call check unpause ", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(20000);
        await mockPiToken.mock.transfer.returns(true);
        await mockPiToken.mock.approve.returns(true);
        await mockPiToken.mock.allowance.returns(0);
        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        
        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStrat");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await mockCtrlAave.pause();
        await mockCtrlAave.unpause();
        expect(poolMockFake.deposit).to.have.callCount(1);
    
    })



    it("should call retire strategy, works, with paused, balance of pool 0", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken, {address: "0xdB82Ca63dcC9fD42c71A74D9fa45A35117F45B7F"});
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);
        await mockPiToken.approve.returns(true);
        await mockPiToken.transfer.returns(true);
        

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);
        await dataProviderFake.getUserReserveData.returnsAtCall(0,['0', 0, 0, 0, 0, 0, 0, 0, false]);

        await dataProviderFake.getUserReserveData.returnsAtCall(1,['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(2, ['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(3, ['5', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(4, ['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);


        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "100000000000000000000"])

        const IncncCtrl = await ethers.getContractFactory("IncentivesControllerMock");
        const incentivesController = await smock.fake(IncncCtrl, { address: "0xC469e7aE4aD962c30c7111dc580B4adbc7E914DD"});


        const WNMock = await ethers.getContractFactory("WETHMock");
        const wnative = await smock.fake(WNMock, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await wnative.balanceOf.returns(1);
        await wnative.approve.returns(true);

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStratV2");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })

        const PriceFeedMock = await ethers.getContractFactory("PriceFeedMock");
        const priceFeedMock= await smock.fake(PriceFeedMock);


        const UniswapRouterMock = await ethers.getContractFactory("UniswapRouterMock");
        const uniswapRouterMock = await smock.fake(UniswapRouterMock);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])

        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await mockCtrlAave.setVariable("oracles", {
            "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f": priceFeedMock.address,
        })


        await mockCtrlAave.setVariable("oracles", {
            "0xdB82Ca63dcC9fD42c71A74D9fa45A35117F45B7F" : priceFeedMock.address,
        })

        await mockCtrlAave.setVariable("exchange", uniswapRouterMock.address);
        await mockCtrlAave.pause();
        await expect(mockCtrlAave.connect(mockController.wallet).retireStrat()).to.emit(mockCtrlAave, "Harvested");
    })


    it("should call retire strategy", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken, {address: "0xdB82Ca63dcC9fD42c71A74D9fa45A35117F45B7F"});
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);
        await mockPiToken.approve.returns(true);
        await mockPiToken.transfer.returns(true);
        

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);
        await dataProviderFake.getUserReserveData.returnsAtCall(0,['0', 0, 0, 0, 0, 0, 0, 0, false]);

        await dataProviderFake.getUserReserveData.returnsAtCall(1,['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(2, ['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(3, ['5', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(4, ['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);


        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "100000000000000000000"])

        const IncncCtrl = await ethers.getContractFactory("IncentivesControllerMock");
        const incentivesController = await smock.fake(IncncCtrl, { address: "0xC469e7aE4aD962c30c7111dc580B4adbc7E914DD"});


        const WNMock = await ethers.getContractFactory("WETHMock");
        const wnative = await smock.fake(WNMock, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await wnative.balanceOf.returns(1);
        await wnative.approve.returns(true);

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStratV2");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(mockPiToken.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })

        const PriceFeedMock = await ethers.getContractFactory("PriceFeedMock");
        const priceFeedMock= await smock.fake(PriceFeedMock);


        const UniswapRouterMock = await ethers.getContractFactory("UniswapRouterMock");
        const uniswapRouterMock = await smock.fake(UniswapRouterMock);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])

        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await mockCtrlAave.setVariable("oracles", {
            "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f": priceFeedMock.address,
        })


        await mockCtrlAave.setVariable("oracles", {
            "0xdB82Ca63dcC9fD42c71A74D9fa45A35117F45B7F" : priceFeedMock.address,
        })

        await mockCtrlAave.setVariable("exchange", uniswapRouterMock.address);
        await mockCtrlAave.pause();
        await expect(mockCtrlAave.retireStrat()).to.be.revertedWith("Not from controller");
    })



    it("should call retire strategy, works, want differ from wnative", async()=>{
        const MockController = await ethers.getContractFactory("Controller");
        const mockController = await smock.fake(MockController);
        const _MockPiToken = await ethers.getContractFactory("TokenMock");
        const mockPiToken = await smock.fake(_MockPiToken, {address: "0xdB82Ca63dcC9fD42c71A74D9fa45A35117F45B7F"});
        await mockPiToken.balanceOf.returnsAtCall(0,20000);
        await mockPiToken.balanceOf.returnsAtCall(1,20000);
        await mockPiToken.balanceOf.returnsAtCall(2,20000);
        await mockPiToken.balanceOf.returnsAtCall(3,200000);
        await mockPiToken.approve.returns(true);
        await mockPiToken.transfer.returns(true);
        

        const MockDataProvider = await ethers.getContractFactory("DataProviderMock");
        const dataProviderFake = await smock.fake(MockDataProvider, {address: "0x43ca3d2c94be00692d207c6a1e60d8b325c6f12f"});
        await dataProviderFake.getReserveTokensAddresses.returns([ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS]);
        await dataProviderFake.getUserReserveData.returnsAtCall(0,['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(1, ['100000000000000000000', 0, 1, 0, 0, 0, 0, 0, false]);
        await dataProviderFake.getUserReserveData.returnsAtCall(2, ['100000000000000000000', 0, 0, 0, 0, 0, 0, 0, false]);

        const PoolMock = await ethers.getContractFactory("PoolMock");
        const poolMockFake = await smock.fake(PoolMock, {address: "0xb09da8a5B236fE0295A345035287e80bb0008290"});
        await poolMockFake.getUserAccountData.returns([0, 0, 0, 0, 0, "100000000000000000000"])

        const IncncCtrl = await ethers.getContractFactory("IncentivesControllerMock");
        const incentivesController = await smock.fake(IncncCtrl, { address: "0xC469e7aE4aD962c30c7111dc580B4adbc7E914DD"});


        const WNMock = await ethers.getContractFactory("WETHMock");
        const wnative = await smock.fake(WNMock, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await wnative.balanceOf.returns(1);
        await wnative.approve.returns(true);
        await wnative.transfer.returns(true);

        const mockCtrlAaveFactory = await smock.mock("ControllerAaveStratV2");
        const mockCtrlAave = await mockCtrlAaveFactory.deploy(wnative.address, 1, 100,0,0, mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })

        const PriceFeedMock = await ethers.getContractFactory("PriceFeedMock");
        const priceFeedMock= await smock.fake(PriceFeedMock);


        const UniswapRouterMock = await ethers.getContractFactory("UniswapRouterMock");
        const uniswapRouterMock = await smock.fake(UniswapRouterMock);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])

        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await mockCtrlAave.setVariable("oracles", {
            "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f": priceFeedMock.address,
        })


        await mockCtrlAave.setVariable("oracles", {
            "0xdB82Ca63dcC9fD42c71A74D9fa45A35117F45B7F" : priceFeedMock.address,
        })

        await mockCtrlAave.setVariable("exchange", uniswapRouterMock.address);
        
        await expect(mockCtrlAave.connect(mockController.wallet).retireStrat()).to.emit(mockCtrlAave,"Harvested");
    })

})