const chai = require('chai');
const expect = chai.expect;
const { isBytes } = require("ethers/lib/utils");
const { waffle, ethers } = require("hardhat");
const { deployMockContract } = waffle;
const ZERO_ADDRESS = ethers.constants.AddressZero;
const MOCK_ADDRESS = '0x' + '1'.repeat(40)
const MOCK_ADDRESSV2 = '0x' + '2'.repeat(40)
const MockPiToken = require("../../artifacts/contracts/auditMocs/IMockPiToken.sol/IMockPiToken.json")
const Archimedes = require("../../artifacts/contracts/Archimedes.sol/Archimedes.json");
const Strategy = require("../../artifacts/interfaces/IStrategy.sol/IStrategy.json");
const { smock } = require("@defi-wonderland/smock");
chai.use(smock.matchers);


describe("Controller", ()=>{


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
        this.Controller = await ethers.getContractFactory("ControllerMockV2");
    })

    it("deploy fail, invalid erc20 from balanceOf", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(1);
        await mockPiToken.mock.allowance.returns(1);
        await mockPiToken.mock.symbol.returns("s");
        await expect(this.Controller.deploy(mockPiToken.address, ZERO_ADDRESS, ZERO_ADDRESS, "ss")).to.be.revertedWith("Invalid ERC20")
    })

    it("deploy fail, invalid erc20 from allowance", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(1);
        await mockPiToken.mock.symbol.returns("s");
        await expect(this.Controller.deploy(mockPiToken.address, ZERO_ADDRESS, ZERO_ADDRESS, "ss")).to.be.revertedWith("Invalid ERC20")
    })

    it("deploy fail, invalid pitoken on archimedes", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(ZERO_ADDRESS);
        await expect(this.Controller.deploy(mockPiToken.address, mockArchimedes.address, ZERO_ADDRESS, "ss")).to.be.revertedWith("Invalid PiToken on Archimedes")
    })

    it("deploy fail, invalid treasury", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        await expect(this.Controller.deploy(mockPiToken.address, mockArchimedes.address, ZERO_ADDRESS, "ss")).to.be.revertedWith("Treasury !ZeroAddress")
    })

    it("deploy works", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        const treasury = await controller.treasury();
        expect(treasury).to.be.equal(MOCK_ADDRESS);
        const archimedes = await controller.archimedes();
        expect(archimedes).to.be.equal(mockArchimedes.address);
    })

    it("call decimals", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.decimals.returns(18);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        const decimals = await controller.decimals();
        expect(decimals.toString()).to.be.equal("18");
    })

    it("call set pid from archimedes, work", async()=>{ 
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.decimals.returns(18);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const ArchimedesCaller = await ethers.getContractFactory("ArchimedesCallerMock");
        const archimedesCaller = await ArchimedesCaller.deploy();
        const controller = await this.Controller.deploy(mockPiToken.address, archimedesCaller.address, MOCK_ADDRESS, "ss");
        await archimedesCaller.mockCallSetPidOnController(controller.address, 4294967295);
        const pid = await controller.pid();
        expect(pid).to.be.equal(4294967295);
    })

    it("call set pid from archimedes, fail", async()=>{ 
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.decimals.returns(18);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const ArchimedesCaller = await ethers.getContractFactory("ArchimedesCallerMock");
        const archimedesCaller = await ArchimedesCaller.deploy();
        const controller = await this.Controller.deploy(mockPiToken.address, archimedesCaller.address, MOCK_ADDRESS, "ss");
        await archimedesCaller.mockCallSetPidOnController(controller.address, 1);
        const pid = await controller.pid();
        expect(pid).to.be.equal(1);
    })

    it("call set pid from archimedes, fail, not as archimedes", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.decimals.returns(18);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const ArchimedesCaller = await ethers.getContractFactory("ArchimedesCallerMock");
        const archimedesCaller = await ArchimedesCaller.deploy();
        const controller = await this.Controller.deploy(mockPiToken.address, archimedesCaller.address, MOCK_ADDRESS, "ss");
        await expect(controller.setPid(1)).to.be.revertedWith("Not from Archimedes");
    })

    it("call set treasury, fail same address", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.decimals.returns(18);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        await expect(controller.setTreasury(MOCK_ADDRESS)).to.be.revertedWith("Same address");
    })

    it("call set treasury, fail zero address", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.decimals.returns(18);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        await expect(controller.setTreasury(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress");
    })

    it("call set treasury, work", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.decimals.returns(18);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        await expect(controller.setTreasury(MOCK_ADDRESSV2)).to.emit(controller, "NewTreasury").withArgs(MOCK_ADDRESS, MOCK_ADDRESSV2);
        const _trsry = await controller.treasury();
        expect(_trsry).to.be.equal(MOCK_ADDRESSV2);
    })

    it("call set strategy, fail same strategy", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.decimals.returns(18);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        await expect(controller.setStrategy(ZERO_ADDRESS)).to.be.revertedWith("Same strategy");
    })

    it("call set strategy, fail", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.decimals.returns(18);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        await controller.mockStrategySet(MOCK_ADDRESS);
        await expect(controller.setStrategy(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress");
    })

    it("call set strategy, fail old strategy still has depostis", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.decimals.returns(18);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        const mockOldStrategy = await deployMockContract(aliceAccount, Strategy.abi);
        await mockOldStrategy.mock.retireStrat.returns();
        await mockOldStrategy.mock.balance.returns(1);
        await controller.mockStrategySet(mockOldStrategy.address);

        const mockStrategy = await deployMockContract(aliceAccount, Strategy.abi);
        await mockStrategy.mock.balance.returns(1);
        await expect(controller.setStrategy(mockStrategy.address)).to.be.revertedWith("Strategy still has deposits");
    })

    it("call set strategy, work", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.decimals.returns(18);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        const mockOldStrategy = await deployMockContract(aliceAccount, Strategy.abi);
        await mockOldStrategy.mock.retireStrat.returns();
        await mockOldStrategy.mock.balance.returns(0);
        await controller.mockStrategySet(mockOldStrategy.address);

        const mockStrategy = await deployMockContract(aliceAccount, Strategy.abi);
        await mockStrategy.mock.balance.returns(1);
        await expect(controller.setStrategy(mockStrategy.address)).to.emit(controller, "NewStrategy").withArgs(mockOldStrategy.address, mockStrategy.address);
    })

    it("call set withdraw fee, fail same rate",async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        const fee = await controller.withdrawFee();
        await expect(controller.setWithdrawFee(fee)).to.be.revertedWith("Same fee");
    })

    it("call set withdraw fee, fail bigger then maximum",async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        await expect(controller.setWithdrawFee(101)).to.be.revertedWith("!cap");
    })

    it("call set withdraw fee, work",async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        await controller.setWithdrawFee(11);
        const fee = await controller.withdrawFee();
        expect(fee.toString()).to.be.equal('11');
    })

    it("call set deposit cap, fail same cap",async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        const cap = await controller.depositCap();
        await expect(controller.setDepositCap(cap)).to.be.revertedWith("Same cap"); 
    })

    it("call set deposit cap, work",async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        const cap = await controller.depositCap();
        await expect(controller.setDepositCap(1)).to.emit(controller ,"NewDepositCap").withArgs("0","1"); 
    })

    it("call deposit, from archimedes, fail strategy paused",async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const ArchimedesCaller = await ethers.getContractFactory("ArchimedesCallerMock");
        const archimedesCaller = await ArchimedesCaller.deploy();
        const strategy = await deployMockContract(aliceAccount, Strategy.abi);
        await strategy.mock.paused.returns(true);
        const controller = await this.Controller.deploy(mockPiToken.address, archimedesCaller.address, MOCK_ADDRESS, "ss");
        await controller.mockStrategySet(strategy.address);
        await expect(archimedesCaller.mockCallDepositOnController(controller.address, alice, 1)).to.be.revertedWith('Strategy paused'); 
    })

    it("call deposit, from archimedes, fail insufficient amount",async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.transferFrom.returns(true);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const ArchimedesCaller = await ethers.getContractFactory("ArchimedesCallerMock");
        const archimedesCaller = await ArchimedesCaller.deploy();
        const strategy = await deployMockContract(aliceAccount, Strategy.abi);
        await strategy.mock.paused.returns(false);
        await strategy.mock.balance.returns(2)
        await strategy.mock.beforeMovement.returns();
        const controller = await this.Controller.deploy(mockPiToken.address, archimedesCaller.address, MOCK_ADDRESS, "ss");
        await controller.mockStrategySet(strategy.address);
        await expect(archimedesCaller.mockCallDepositOnController(controller.address, alice, 0)).to.be.revertedWith('Insufficient amount'); 
    })

    it("call deposit, from archimedes, works",async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.transferFrom.returns(true);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const ArchimedesCaller = await ethers.getContractFactory("ArchimedesCallerMock");
        const archimedesCaller = await ArchimedesCaller.deploy();
        const strategy = await smock.fake(Strategy);
        await strategy.paused.returns(false);
        await strategy.balance.returns(2)
        await strategy.beforeMovement.returns();
        const controller = await this.Controller.deploy(mockPiToken.address, archimedesCaller.address, MOCK_ADDRESS, "ss");
        await controller.mockStrategySet(strategy.address);
        await archimedesCaller.mockCallDepositOnController(controller.address, alice, 1);
        expect(strategy.beforeMovement).to.have.callCount(1);
    })

    it("call withdraw, from archimedes, fail insufficient shares",async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.transferFrom.returns(true);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const ArchimedesCaller = await ethers.getContractFactory("ArchimedesCallerMock");
        const archimedesCaller = await ArchimedesCaller.deploy();
        const strategy = await deployMockContract(aliceAccount, Strategy.abi);
        await strategy.mock.paused.returns(false);
        await strategy.mock.balance.returns(2)
        await strategy.mock.beforeMovement.returns();
        const controller = await this.Controller.deploy(mockPiToken.address, archimedesCaller.address, MOCK_ADDRESS, "ss");
        await controller.mockStrategySet(strategy.address);
        await expect(archimedesCaller.mockCallWithdrawOnController(controller.address, alice, 0)).to.be.revertedWith("Insufficient shares"); 
    })

    it("call withdraw, from archimedes, fail can't withdraw from strategy",async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.transferFrom.returns(true);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const ArchimedesCaller = await ethers.getContractFactory("ArchimedesCallerMock");
        const archimedesCaller = await ArchimedesCaller.deploy();
        const strategy = await deployMockContract(aliceAccount, Strategy.abi);
        await strategy.mock.paused.returns(false);
        await strategy.mock.balance.returns(10)
        await strategy.mock.beforeMovement.returns();
        await strategy.mock.withdraw.returns(0)
        const controller = await this.Controller.deploy(mockPiToken.address, archimedesCaller.address, MOCK_ADDRESS, "ss");
        await controller.mockStrategySet(strategy.address);
        await controller.mockTotalSupply(alice, 10);
        await expect(archimedesCaller.mockCallWithdrawOnController(controller.address, alice, 1)).to.be.revertedWith("Can't withdraw from strategy..."); 
    })

    it("call withdraw, from archimedes", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        await mockPiToken.mock.transferFrom.returns(true);
        await mockPiToken.mock.transfer.returns(true);
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const ArchimedesCaller = await ethers.getContractFactory("ArchimedesCallerMock");
        const archimedesCaller = await ArchimedesCaller.deploy();
        const strategy = await smock.fake(Strategy);
        await strategy.paused.returns(false);
        await strategy.balance.returns(10)
        await strategy.beforeMovement.returns();
        await strategy.withdraw.returns(100000)
        const controller = await this.Controller.deploy(mockPiToken.address, archimedesCaller.address, MOCK_ADDRESS, "ss");
        await controller.mockStrategySet(strategy.address);
        await controller.mockTotalSupply(alice, 10);
        await archimedesCaller.mockCallWithdrawOnController(controller.address, alice, 1); 
        expect(strategy.beforeMovement).to.have.callCount(1);
    })

    it("call check deposit cap, from archimedes", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        const cap = await controller.depositCap();
        const strategy = await deployMockContract(aliceAccount, Strategy.abi);
        await strategy.mock.paused.returns(false);
        await strategy.mock.balance.returns(0);
        await controller.mockStrategySet(strategy.address);
        await expect(controller.setDepositCap(1)).to.emit(controller ,"NewDepositCap").withArgs("0","1");
        await expect(controller.mockCallCheckDepositCap(0)).to.not.be.revertedWith("Max depositCap reached");
    })

    it("call check deposit cap, work", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        const cap = await controller.depositCap();
        const strategy = await deployMockContract(aliceAccount, Strategy.abi);
        await strategy.mock.paused.returns(false);
        await strategy.mock.balance.returns(2);
        await controller.mockStrategySet(strategy.address);
        await expect(controller.setDepositCap(1)).to.emit(controller ,"NewDepositCap").withArgs("0","1");
        await expect(controller.mockCallCheckDepositCap(0)).to.be.revertedWith("Max depositCap reached");
    })

    it("call check avaialble deposit, from archimedes, deposit cap bigger then 0, balance bigger then deposit", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        const cap = await controller.depositCap();
        const strategy = await smock.fake(Strategy);
        await strategy.paused.returns(false);
        await strategy.balance.returns(2);
        await controller.mockStrategySet(strategy.address);
        await expect(controller.setDepositCap(1)).to.emit(controller ,"NewDepositCap").withArgs("0","1");
        await controller.availableDeposit();
        expect(strategy.balance).to.have.callCount(1);
    })

    it("call check avaialble deposit, from archimedes, deposit cap 0", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        const cap = await controller.depositCap();
        const strategy = await smock.fake(Strategy);
        await strategy.paused.returns(false);
        await strategy.balance.returns(2);
        await controller.mockStrategySet(strategy.address);
        await controller.availableDeposit();
        expect(strategy.balance).to.have.callCount(0);

    })

    it("call check avaialble deposit, from archimedes, deposit cap bigger then 0, balance lower then deposit", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        const cap = await controller.depositCap();
        const strategy = await smock.fake(Strategy);
        await strategy.paused.returns(false);
        await strategy.balance.returns(2);
        await controller.mockStrategySet(strategy.address);
        await expect(controller.setDepositCap(100)).to.emit(controller ,"NewDepositCap").withArgs("0","100");
        await controller.availableDeposit();
        expect(strategy.balance).to.have.callCount(2);

    })

    it("call before token transfer, go into if, from archimedes", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await smock.fake(Archimedes);
        await mockArchimedes.piToken.returns(MOCK_ADDRESS);
        await mockArchimedes.beforeSharesTransfer.returns();
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        await controller.mockCallBeforeTokenTransfer(MOCK_ADDRESSV2, MOCK_ADDRESS, 1);
        expect(mockArchimedes.beforeSharesTransfer).to.have.callCount(1);
    })

    it("call after token transfer, go into if, from archimedes", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await smock.fake(Archimedes);
        await mockArchimedes.piToken.returns(MOCK_ADDRESS);
        await mockArchimedes.afterSharesTransfer.returns();
        const controller = await this.Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        await controller.mockCallAfterTokenTransfer(MOCK_ADDRESSV2, MOCK_ADDRESS, 1);
        expect(mockArchimedes.afterSharesTransfer).to.have.callCount(1);
    })

    it("call strategy deposit with amount bigger then 0", async()=>{
        const WantToken = await ethers.getContractFactory("WantMockForController");
        const wantToken = await WantToken.deploy();
        await wantToken.setBalance(0);
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const mockArchimedes = await deployMockContract(aliceAccount, Archimedes.abi);
        await mockArchimedes.mock.piToken.returns(MOCK_ADDRESS);
        const controller = await this.Controller.deploy(wantToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        const cap = await controller.depositCap();
        const strategy = await smock.fake(Strategy);
        await strategy.paused.returns(false);
        await strategy.balance.returns(2);
        await strategy.deposit.returns();
        await controller.mockStrategySet(strategy.address);
        await wantToken.setBalance(1);
        await controller.mockCallStrategyDeposit();
        expect(strategy.deposit).to.have.callCount(1);
    })

    it("call set pid, fail already assigned", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const ArchimedesMock = await ethers.getContractFactory("Archimedes");
        const mockArchimedes = await smock.fake(ArchimedesMock);
        await mockArchimedes.piToken.returns(MOCK_ADDRESS);
        await mockArchimedes.afterSharesTransfer.returns();
        const Controller = await smock.mock("Controller");
        const controller = await Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        await aliceAccount.sendTransaction({
            to: mockArchimedes.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await controller.setVariable("pid", "0")
        await expect(controller.connect(mockArchimedes.wallet).setPid(6553)).to.be.revertedWith("pid already assigned");
    })

    it("set strategy works, not go into if", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.allowance.returns(0);
        await mockPiToken.mock.symbol.returns("s");
        const ArchimedesMock = await ethers.getContractFactory("Archimedes");
        const mockArchimedes = await smock.fake(ArchimedesMock);
        await mockArchimedes.piToken.returns(MOCK_ADDRESS);
        await mockArchimedes.afterSharesTransfer.returns();
        const Controller = await smock.mock("Controller");
        const controller = await Controller.deploy(mockPiToken.address, mockArchimedes.address, MOCK_ADDRESS, "ss");
        await aliceAccount.sendTransaction({
            to: mockArchimedes.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await controller.setVariable("strategy", ZERO_ADDRESS);

        await expect(controller.setStrategy(MOCK_ADDRESS)).to.emit(controller, "NewStrategy");
    })
})