const chai = require('chai')
const expect = chai.expect 
const { deployMockContract } = require("ethereum-waffle");
const { wallfe, ethers } = require("hardhat");
const ZERO_ADDRESS = ethers.constants.AddressZero;
const MOCK_ADDRESS = '0x' + '1'.repeat(40)
const Controller = require("../../artifacts/contracts/Controller.sol/Controller.json");
const PiToken = require("../../artifacts/contracts/PiToken.sol/PiToken.json");
const WETH = require("../../artifacts/contracts/mocks/WETHMock.sol/WETHMock.json");
const RefferalManager = require("../../artifacts/interfaces/IReferral.sol/IReferral.json");
const MockPiToken = require("../../artifacts/contracts/auditMocs/IMockPiToken.sol/IMockPiToken.json")
const { smock } = require("@defi-wonderland/smock");
const { BigNumber } = require('ethers');
chai.use(smock.matchers)



describe("Archimedes", ()=>{
    before(async ()=>{
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
        this.Archimedes = await ethers.getContractFactory("ArchimedesMockV2");
        this.Controller = await ethers.getContractFactory("Controller");
        this.ArchimedesCaller = await ethers.getContractFactory("ArchimedesCallerMock")
        const blockNumber = await ethers.provider.getBlockNumber();
        this.archimedes = await this.Archimedes.deploy(MOCK_ADDRESS, blockNumber+2, MOCK_ADDRESS);

    })

    it("should fail contract deplopy", async()=>{
        await expect(this.Archimedes.deploy(ZERO_ADDRESS, 1, MOCK_ADDRESS)).to.be.revertedWith(
            'Pi address !ZeroAddress'
        ) 
        await expect(this.Archimedes.deploy(MOCK_ADDRESS, 0, MOCK_ADDRESS)).to.be.revertedWith(
            'StartBlock must be in the future'
        )
    })

    it("should add new pool, fail, address zero not allowed", async()=>{
        await expect(this.archimedes.addNewPool(ZERO_ADDRESS, MOCK_ADDRESS, 1, true)).to.be.revertedWith("Address zero not allowed");
    })

    it("should add new pool, fail, not an archimedes controller", async()=>{
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.archimedes.returns(MOCK_ADDRESS);
        await expect(this.archimedes.addNewPool(MOCK_ADDRESS, mockController.address, 1, true)).to.be.revertedWith("Not an Archimedes controller");
    })

    it("should add new pool, fail, not an strategy", async()=>{
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.archimedes.returns(this.archimedes.address);
        await mockController.mock.strategy.returns(ZERO_ADDRESS);
        await expect(this.archimedes.addNewPool(MOCK_ADDRESS, mockController.address, 1, true)).to.be.revertedWith("Controller without strategy");
    })

    it('should fail, mass update false', async()=>{
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.archimedes.returns(this.archimedes.address);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(100);
        await expect(this.archimedes.addNewPool(MOCK_ADDRESS, mockController.address, 1, false)).to.be.revertedWith("Pid doesn't match");
    })

    it('should fail, mass update false', async()=>{
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.archimedes.returns(this.archimedes.address);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(100);
        await expect(this.archimedes.addNewPool(MOCK_ADDRESS, mockController.address, 1, true)).to.be.revertedWith("Pid doesn't match");
    })

    it('should work, mass update false', async()=>{
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.archimedes.returns(this.archimedes.address);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await expect(this.archimedes.addNewPool(MOCK_ADDRESS, mockController.address, 1, true)).to.emit(this.archimedes, 'NewPool').withArgs(0, MOCK_ADDRESS, 1);
    })

    it('should change pool wheight, mass update false, pi token community left to mint zero', async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();
        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await expect(archimedes.addNewPool(mockPiToken.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockPiToken.address, 1);
        await expect(archimedes.changePoolWeighing( 0, 1, false)).to.emit(archimedes, "PoolWeighingUpdated").withArgs(0,1,1);
    })

    it('should change pool wheight, mass update true, pi token community left to mint zero', async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await expect(archimedes.addNewPool(mockPiToken.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockPiToken.address, 1);
        await expect(archimedes.changePoolWeighing( 0, 1, true)).to.emit(archimedes, "PoolWeighingUpdated").withArgs(0,1,1);
    })

    it('should call  pending pi token', async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await expect(archimedes.addNewPool(mockPiToken.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockPiToken.address, 1);
        const result = await archimedes.pendingPiToken(0, alice);
        expect(result.toString()).to.be.equal('0');

    })

    it('should call deposit native, should fail, insuficient deposit', async() => {
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await expect(archimedes.addNewPool(mockPiToken.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockPiToken.address, 1);
        await expect(archimedes.depositNative(0, MOCK_ADDRESS, {from:alice, value: '0'})).to.be.revertedWith("Insufficient deposit");
    })

    it('should call deposit native, should fail, only native token pool', async() => {
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await expect(archimedes.addNewPool(mockPiToken.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockPiToken.address, 1);
        await expect(archimedes.depositNative(0, MOCK_ADDRESS, {from:alice, value: '1'})).to.be.revertedWith("Only Native token pool");
    })

    it('should call deposit native, should work', async() => {
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.depositNative(0, MOCK_ADDRESS, {from:alice, value: '1'})).to.emit(archimedes, 'Deposit').withArgs(0, alice, '1');
    })

    it("should call deposit, fail, insuficient deposit", async()=> {
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 0,MOCK_ADDRESS)).to.be.revertedWith("Insufficient deposit");
    })

    it("should call deposit, fail", async()=> {
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
    })

    it("should call deposit all, fail, can't deposit all native", async()=> {
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.depositAll(0, MOCK_ADDRESS)).to.be.revertedWith("Can't deposit all Native");
    })

    it("should call deposit all, should work", async()=> {
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await expect(archimedes.addNewPool(mockERC20.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockERC20.address, 1);
        await expect(archimedes.depositAll(0, MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
    })

    it("should call withdraw, fail, 0 shares", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await expect(archimedes.addNewPool(mockERC20.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockERC20.address, 1);
        await expect(archimedes.withdraw(0, 0)).to.be.revertedWith("0 shares");
    })

    it("should call withdraw, fail, no sufficient shares", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await expect(archimedes.addNewPool(mockERC20.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockERC20.address, 1);
        await expect(archimedes.withdraw(0, 100)).to.be.revertedWith("withdraw: not sufficient founds");
    })

    it("should call withdraw, fail, no funds withdraw", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(0);
        await expect(archimedes.addNewPool(mockERC20.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockERC20.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await expect(archimedes.withdraw(0, 1)).to.be.revertedWith("No funds withdrawn");
    })

    it("should call withdraw, funds to withdraw, pool address not wnative", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockERC20.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockERC20.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await expect(archimedes.withdraw(0, 1)).to.emit(archimedes,"Withdraw").withArgs(0,alice,1);
    })

    it("should call withdraw, funds to withdraw, pool address is wnative", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await expect(archimedes.withdraw(0, 1)).to.emit(archimedes,"Withdraw").withArgs(0,alice,1);
    })


    it("should call withdraw all, should work", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await expect(archimedes.withdrawAll(0)).to.emit(archimedes,"Withdraw").withArgs(0,alice,1);
    })

    it("should call harvest, should work, not emtiting harvest event", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await expect(archimedes.harvest(0)).to.not.emit(archimedes, "Harvested").withArgs(0,alice,1);
    })

    it("should call set referral address, fail, same manager", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        const refManager = await archimedes.referralMgr();
        await expect(archimedes.setReferralAddress(refManager)).to.be.revertedWith("Same Manager");
    })

    it("should call set referral addres, fail address is zero", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await archimedes.mockSetReferralManager(MOCK_ADDRESS)
        await expect(archimedes.setReferralAddress(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress");
    })

    it("should call set referral addres, work", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await archimedes.setReferralAddress(MOCK_ADDRESS);
        const refManager = await archimedes.referralMgr();
        expect(refManager).to.be.equal(MOCK_ADDRESS);

    })

    it("should call set referral commision, fail same rate", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        const refComission = await archimedes.referralCommissionRate();
        await expect(archimedes.setReferralCommissionRate(refComission)).to.be.revertedWith("Same rate");
    })

    it("should call set referral commision, fail bigger then maximum rate", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.setReferralCommissionRate(55)).to.be.revertedWith("rate greater than MaxCommission");
    })

    it("should call poolLength, should work", async()=>{
        const poolLength = await this.archimedes.poolLength();
        expect(poolLength.toString()).to.be.equal("1");
    })

    it('should call user shares without address, work', async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        const usershares = await archimedes.mockCallUserShares(0)
        expect(usershares.toString()).to.be.equal("1");
    })

    it('should call user shares with address, work', async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        const usershares = await archimedes.mockCallUserSharesWithAddress(0, alice);
        expect(usershares.toString()).to.be.equal("1");
    })

    it("call paid rewards after harvesting", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await expect(archimedes.harvest(0)).to.not.emit(archimedes, "Harvested").withArgs(0,alice,1);
        let paidRewards = await archimedes.mockCallPaidRewards(0);
        expect(paidRewards.toString()).to.be.equal("0");
        paidRewards = await archimedes.mockCallPaidRewardsWithAddress(0, alice);
        expect(paidRewards.toString()).to.be.equal("0");

    })

    it("call price per share", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(5);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await mockController.mock.decimals.returns(18);
        await mockController.mock.balance.returns(10)
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        const pricePerShare = await archimedes.getPricePerFullShare(0);
        expect(pricePerShare.toString()).to.be.equal("100000000000000000")
    })

    it("call balance on controller", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(5);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await mockController.mock.decimals.returns(18);
        await mockController.mock.balance.returns(10)
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        const balance = await archimedes.balance(0);
        expect(balance.toString()).to.be.equal("10")

    })

    it("should call balance of on controller", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(5);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await mockController.mock.decimals.returns(18);
        await mockController.mock.balance.returns(10)
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        const balance = await archimedes.balanceOf(0, alice);
        expect(balance.toString()).to.be.equal("5")

    })

    it("should call block number on archimedes", async()=>{
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(MOCK_ADDRESS, blockNumber+2, MOCK_ADDRESS);
        const blkNmb = await archimedes.mockCallBlockNumber();
        expect(blkNmb).to.be.equal(blockNumber+1);
    })

    it("should call pi token per block", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        await mockPiToken.mock.communityMintPerBlock.returns(10000);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const pis = await archimedes.piTokenPerBlock();
        expect(pis.toString()).to.be.equal("9900")
    })

    it("should call redeem pi token, fail still minting", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.totalSupply.returns(100);
        await mockPiToken.mock.MAX_SUPPLY.returns(10000);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        await expect(archimedes.redeemStuckedPiTokens()).to.be.revertedWith("PiToken still minting");
        
    })

    it("should call redeem pi token, fail still waiting", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.totalSupply.returns(10000);
        await mockPiToken.mock.MAX_SUPPLY.returns(10000);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        await expect(archimedes.redeemStuckedPiTokens()).to.be.revertedWith("Still waiting");
        
    })

    it("should call redeem pi token, should work, balance 0", async()=>{
        const mockPiToken = await smock.fake(MockPiToken);
        await mockPiToken.totalSupply.returns(10000);
        await mockPiToken.MAX_SUPPLY.returns(10000);
        await mockPiToken.balanceOf.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        await archimedes.setBlockNumber(blockNumber+32850000+3);
        await archimedes.redeemStuckedPiTokens();
        expect(mockPiToken.balanceOf).to.have.callCount(1);
        
    })

    it("should call redeem pi token, should work, balance greater then 0", async()=>{
        const mockPiToken = await smock.fake(MockPiToken);
        await mockPiToken.totalSupply.returns(10000);
        await mockPiToken.MAX_SUPPLY.returns(10000);
        await mockPiToken.balanceOf.returns(10);
        await mockPiToken.transfer.returns(true);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        await archimedes.setBlockNumber(blockNumber+32850000+3);
        await archimedes.redeemStuckedPiTokens();
        expect(mockPiToken.balanceOf).to.have.callCount(1);        
    })

    it("should call harvest all, should work, not emtiting harvest event", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await expect(archimedes.harvestAll()).to.not.emit(archimedes, "Harvested").withArgs(0,alice,1);
    })

    it("should call emergency withdraw, should work", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await expect(archimedes.emergencyWithdraw(0)).to.emit(archimedes,"EmergencyWithdraw").withArgs(0,alice,1);
    })

    it("should call before shares transfer, amount 0 return empty", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await smock.fake(Controller);
        await mockController.strategy.returns(MOCK_ADDRESS);
        await mockController.setPid.returns(0);
        await mockController.archimedes.returns(archimedes.address);
        await mockController.totalSupply.returns(100);
        await mockController.balanceOf.returns(1);
        await mockController.deposit.returns();
        await mockController.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await archimedes.connect(mockController.wallet).beforeSharesTransfer(0,alice, alice, 0);
        expect(mockController.balanceOf).to.have.callCount(3);
    
    })

    it("should call before shares transfer, amount bigger then 0 should work", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await smock.fake(Controller);
        await mockController.strategy.returns(MOCK_ADDRESS);
        await mockController.setPid.returns(0);
        await mockController.archimedes.returns(archimedes.address);
        await mockController.totalSupply.returns(100);
        await mockController.balanceOf.returns(1);
        await mockController.deposit.returns();
        await mockController.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await archimedes.connect(mockController.wallet).beforeSharesTransfer(0,alice, alice, 1);

        expect(mockController.balanceOf).to.have.callCount(9);

    })


    it("should call after shares transfer, amount bigger then 0 should work", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await smock.fake(Controller);
        await mockController.strategy.returns(MOCK_ADDRESS);
        await mockController.setPid.returns(0);
        await mockController.archimedes.returns(archimedes.address);
        await mockController.totalSupply.returns(100);
        await mockController.balanceOf.returns(1);
        await mockController.deposit.returns();
        await mockController.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await archimedes.connect(mockController.wallet).afterSharesTransfer(0, alice, alice, 1);
        expect(mockController.balanceOf).to.have.callCount(5);
    })


    it("should call after shares transfer, amount 0 should return empty", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await smock.fake(Controller);
        await mockController.strategy.returns(MOCK_ADDRESS);
        await mockController.setPid.returns(0);
        await mockController.archimedes.returns(archimedes.address);
        await mockController.totalSupply.returns(100);
        await mockController.balanceOf.returns(1);
        await mockController.deposit.returns();
        await mockController.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await archimedes.connect(mockController.wallet).afterSharesTransfer(0,alice,alice,0);
        expect(mockController.balanceOf).to.have.callCount(3);

    })

    it("should call safe pi token transfer, amount bigger then pi token balance", async()=>{
        const mockPiToken = await smock.fake(MockPiToken);
        await mockPiToken.balanceOf.returns(1);
        await mockPiToken.transfer.returns(true);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        await archimedes.mockCallSafePiTokenTransfer(alice, 10)
        expect(mockPiToken.transfer).to.have.callCount(1);


    })

    it("should call safe pi token transfer, amount bigger then pi token balance", async()=>{
        const mockPiToken = await smock.fake(MockPiToken);
        await mockPiToken.balanceOf.returns(1);
        await mockPiToken.transfer.returns(true);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        await archimedes.mockCallSafePiTokenTransfer(alice, 0)
        expect(mockPiToken.transfer).to.have.callCount(1);
    })
    
    it("should call set referral commision, work", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await archimedes.setReferralCommissionRate(50);
        const refCom = await archimedes.referralCommissionRate();
        expect(refCom.toString()).to.be.equal("50")
    })

    it("should call get multiplier", async()=>{
        const res = await this.archimedes.mockCallGetMultiplier(3,10);
        expect(res.toString()).to.be.equal('7');
    })

    it("shoould call pay referal commision, exit at first if", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await smock.fake(PiToken);
        await mockPiToken.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await archimedes.mockCallPayReferralCommission(alice, MOCK_ADDRESS);
        expect(mockPiToken.communityLeftToMint).to.have.callCount(1);
    })

    it("shoould call pay referal commision, go into first if", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await smock.fake(PiToken);
        await mockPiToken.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        const mockRefManager = await deployMockContract(aliceAccount, RefferalManager.abi);
        await mockRefManager.mock.getReferrer.returns(alice);

        await archimedes.mockSetReferralManager(mockRefManager.address);
        await archimedes.mockCallPayReferralCommission(alice, 10000);
        expect(mockPiToken.communityLeftToMint).to.have.callCount(2);

    })

    it("shoould call pay referal commision, go into last if", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await smock.fake(PiToken);
        await mockPiToken.communityLeftToMint.returns(1000000000);
        await mockPiToken.communityMint.returns();
        await mockPiToken.communityMintPerBlock.returns(100)
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        const mockRefManager = await deployMockContract(aliceAccount, RefferalManager.abi);
        await mockRefManager.mock.referralPaid.returns();
        await mockRefManager.mock.getReferrer.returns(alice);
        await archimedes.mockSetReferralManager(mockRefManager.address);
        await archimedes.mockCallPayReferralCommission(alice, 1000000);
        expect(mockPiToken.communityLeftToMint).to.have.callCount(2);

    })

    it("shoould call pay referal commision, reffer address is zero", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await smock.fake(PiToken);
        await mockPiToken.communityLeftToMint.returns(1000000000);
        await mockPiToken.communityMint.returns();
        await mockPiToken.communityMintPerBlock.returns(100)

        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        const mockRefManager = await deployMockContract(aliceAccount, RefferalManager.abi);
        await mockRefManager.mock.referralPaid.returns();
        await mockRefManager.mock.getReferrer.returns(ZERO_ADDRESS);
        await archimedes.mockSetReferralManager(mockRefManager.address);
        await archimedes.mockCallPayReferralCommission(alice, 1000000);
        expect(mockPiToken.communityLeftToMint).to.have.callCount(1);

    })

    it('should call  pending pi token', async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(10);
        await mockPiToken.mock.communityMintPerBlock.returns(10);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await smock.fake(Controller);
        await mockController.strategy.returns(MOCK_ADDRESS);
        await mockController.setPid.returns(0);
        await mockController.archimedes.returns(archimedes.address);
        await mockController.totalSupply.returns(100);
        await mockController.balanceOf.returns(1);
        await expect(archimedes.addNewPool(mockPiToken.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockPiToken.address, 1);
        await archimedes.mockSetPoolLastRewardBlock(0,1);
        await archimedes.pendingPiToken(0, alice);
        expect(mockController.totalSupply).to.have.callCount(1);
    })

    it('should call update pool, community left to mint bigger then 0', async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(10);
        await mockPiToken.mock.communityMintPerBlock.returns(10);
        await mockPiToken.mock.communityMint.returns();
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await expect(archimedes.addNewPool(mockPiToken.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockPiToken.address, 1);
        await archimedes.mockSetPoolLastRewardBlock(0,1);
        const blkNumber = await ethers.provider.getBlockNumber();
        await archimedes.updatePool(0);
        const poolInfo = await archimedes.poolInfo(0);
        await expect(poolInfo.lastRewardBlock).to.be.equal(blkNumber+1);
    })

    it('should call update pool, shares total 0', async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(10);
        await mockPiToken.mock.communityMintPerBlock.returns(10);
        await mockPiToken.mock.communityMint.returns();
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(0);
        await mockController.mock.balanceOf.returns(1);
        await expect(archimedes.addNewPool(mockPiToken.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockPiToken.address, 1);
        await archimedes.mockSetPoolLastRewardBlock(0,1);
        const blkNumber = await ethers.provider.getBlockNumber();
        await archimedes.updatePool(0);
        const poolInfo = await archimedes.poolInfo(0);
        await expect(poolInfo.lastRewardBlock).to.be.equal(blkNumber+1);
    })

    it('should call update pool, pi token reward 0', async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(10);
        await mockPiToken.mock.communityMintPerBlock.returns(10);
        await mockPiToken.mock.communityMint.returns();
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, MOCK_ADDRESS);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await expect(archimedes.addNewPool(mockPiToken.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockPiToken.address, 1);
        await archimedes.mockSetPoolLastRewardBlock(0,1);
        await archimedes.mockSetTotalWheight("10000000000000000000000");
        const blkNumber = await ethers.provider.getBlockNumber();
        await archimedes.updatePool(0);
        const poolInfo = await archimedes.poolInfo(0);
        await expect(poolInfo.lastRewardBlock).to.be.equal(blkNumber+1);    
    })

    it("should call before shares transfer, not an controller", async()=>{
        const mockWETH = await deployMockContract(aliceAccount, WETH.abi);
        await mockWETH.mock.deposit.returns();
        await mockWETH.mock.allowance.returns(1);
        await mockWETH.mock.approve.returns(true);
        await mockWETH.mock.transferFrom.returns(true);
        await mockWETH.mock.transfer.returns(true);
        await mockWETH.mock.withdraw.returns();
        await mockWETH.mock.balanceOf.returns(1);
        const mockERC20 = await deployMockContract(aliceAccount, WETH.abi);
        await mockERC20.mock.deposit.returns();
        await mockERC20.mock.allowance.returns(1);
        await mockERC20.mock.approve.returns(true);
        await mockERC20.mock.transferFrom.returns(true);
        await mockERC20.mock.transfer.returns(true);
        await mockERC20.mock.balanceOf.returns(1);
        const mockPiToken = await deployMockContract(aliceAccount, PiToken.abi);
        await mockPiToken.mock.communityLeftToMint.returns(0);
        const blockNumber = await ethers.provider.getBlockNumber();

        const archimedes = await this.Archimedes.deploy(mockPiToken.address, blockNumber+2, mockWETH.address);
        const mockController = await deployMockContract(aliceAccount, Controller.abi);
        await mockController.mock.strategy.returns(MOCK_ADDRESS);
        await mockController.mock.setPid.returns(0);
        await mockController.mock.archimedes.returns(archimedes.address);
        await mockController.mock.totalSupply.returns(100);
        await mockController.mock.balanceOf.returns(1);
        await mockController.mock.deposit.returns();
        await mockController.mock.withdraw.returns(1);
        await expect(archimedes.addNewPool(mockWETH.address, mockController.address, 1, false)).to.emit(archimedes, 'NewPool').withArgs(0, mockWETH.address, 1);
        await expect(archimedes.deposit(0, 1,MOCK_ADDRESS)).to.emit(archimedes, "Deposit").withArgs(0,alice,'1');
        await expect(archimedes.beforeSharesTransfer(0, alice, alice, 0)).to.be.revertedWith("!Controller");
    
    })
  
})
