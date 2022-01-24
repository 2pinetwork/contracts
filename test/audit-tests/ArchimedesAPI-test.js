const chai = require('chai')
const expect = chai.expect 
const { deployMockContract } = require("ethereum-waffle");
const { isBytes } = require("ethers/lib/utils");
const { wallfe, ethers } = require("hardhat");
const ZERO_ADDRESS = ethers.constants.AddressZero;
const MOCK_ADDRESS = '0x' + '1'.repeat(40)
const MOCK_ADDRESSV2 = '0x' + '2'.repeat(40)

const { smock } = require("@defi-wonderland/smock");
const { BigNumber } = require('ethers');
chai.use(smock.matchers);


describe("ArchimedesAPI", async()=>{
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
        this.PriceFeed = await ethers.getContractFactory("PriceFeedMock");
        this.UniswapRouter = await ethers.getContractFactory("UniswapRouterMock");
        this.CurvePool = await ethers.getContractFactory("CurvePoolMock");
        this.RewardsGauge = await ethers.getContractFactory("CurveRewardsGaugeMock");
        this.Controller = await ethers.getContractFactory("Controller");
        this.PiVault = await ethers.getContractFactory("PiVault");
        this.Token = await ethers.getContractFactory("TokenMock");
        this.PiToken = await ethers.getContractFactory("PiTokenMockV2");
        this.Referral = await ethers.getContractFactory("Referral");
        this.ArchimedesAPI = await smock.mock("ArchimedesApiMockV2")
    })

    it("should deploy, all fail", async()=>{
        await expect(this.ArchimedesAPI.deploy(ZERO_ADDRESS, 0, ZERO_ADDRESS)).to.be.revertedWith("Pi address !ZeroAddress");
        await expect(this.ArchimedesAPI.deploy(MOCK_ADDRESS, 0, ZERO_ADDRESS)).to.be.revertedWith("StartBlock must be in the future");
        await expect(this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", ZERO_ADDRESS)).to.be.revertedWith("Handler !ZeroAddress");
    })

    it("should deploy, works", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESSV2);
        let tk = await arch.piToken();
        expect(tk).to.be.equal(MOCK_ADDRESS);
    })

    it("should set exchange, fail same address", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESSV2);
        const oldExch = await arch.exchange()
        await expect(arch.setExchange(oldExch)).to.be.revertedWith("Same address")
    })

    it("should set exchange, fail zero address", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESSV2);
        const oldExch = await arch.exchange()
        await arch.setVariable("exchange", MOCK_ADDRESSV2);
        await expect(arch.setExchange(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress");
    })

    it("should set exchange, works", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESSV2);
        const oldExch = await arch.exchange()
        await expect(arch.setExchange(MOCK_ADDRESSV2)).to.emit(arch, "NewExchange").withArgs(oldExch, MOCK_ADDRESSV2);
    })


    it("should set handler, fail same address", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESSV2);
        const oldExch = await arch.handler()
        await expect(arch.setHandler(oldExch)).to.be.revertedWith("Same address")
    })

    it("should set handler, fail zero address", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESSV2);
        const oldExch = await arch.handler()
        await arch.setVariable("exchange", MOCK_ADDRESSV2);
        await expect(arch.setHandler(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress");
    })

    it("should set handler, works", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESS);
        const oldExch = await arch.handler()
        await expect(arch.setHandler(MOCK_ADDRESSV2)).to.emit(arch, "NewHandler").withArgs(oldExch, MOCK_ADDRESSV2);
    })



    it("should set route, fail first token not pi", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESSV2);
        const oldExch = await arch.handler()
        await expect(arch.setRoute(0, [MOCK_ADDRESSV2, ZERO_ADDRESS])).to.be.revertedWith("First token is not PiToken")
    })

    it("should set route, fail last token not want", async()=>{
        const mockController = await smock.fake(this.Controller);


        const wantToken = await smock.fake(this.Token);

        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESSV2);
        const oldExch = await arch.handler()
        await arch.setVariable("exchange", MOCK_ADDRESSV2);

        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        
        await arch.addNewPool(wantToken.address, mockController.address, 0, false);

        await expect(arch.setRoute(0, [MOCK_ADDRESS, MOCK_ADDRESSV2])).to.be.revertedWith("Last token is not want")
    })

    it("should set route, fail unknown pool", async()=>{
        const mockController = await smock.fake(this.Controller);


        const wantToken = await smock.fake(this.Token);
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESS);

        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)

        await arch.addNewPool(wantToken.address, mockController.address, 0, false);

        await arch.mockSetPoolController(0, ZERO_ADDRESS);
        await expect(arch.setRoute(0, [MOCK_ADDRESS, wantToken.address])).to.be.revertedWith("Unknown pool")
    })

    it("should set route, works", async()=>{
        const mockController = await smock.fake(this.Controller);


        const wantToken = await smock.fake(this.Token);
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESS);

        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)

        await arch.addNewPool(wantToken.address, mockController.address, 0, false);

        await arch.setRoute(0, [MOCK_ADDRESS, wantToken.address])
        const mck = await arch.piTokenToWantRoute(0,0);
        expect(mck).to.be.equal(MOCK_ADDRESS);
        const wtk = await arch.piTokenToWantRoute(0,1);
        expect(wtk).to.be.equal(wantToken.address);
    })



    it("should call add new pool, all fails", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.Token);


        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Controller without strategy")

    })

    it("should call add new pool, mass update false, pid doesn't match", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.Token);


        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(100)
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Pid doesn't match");

    })

    it("should call add new pool, mass update false, pid  match", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.Token);


        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.emit(arch, "NewPool");

    })

    it("should call add new pool, mass update true, pid  match", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.Token);


        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, true)).to.emit(arch, "NewPool");

    })


    it("should call change pool wheight, mass update false, ", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns(0);

        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await arch.addNewPool(wantToken.address, mockController.address, 0, false);
        await expect(arch.changePoolWeighing(0, 10, false)).to.emit(arch,"PoolWeighingUpdated");

    })

    it("should call change pool wheight, mass update true, ", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns(0);

        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await arch.addNewPool(wantToken.address, mockController.address, 0, false);
        await expect(arch.changePoolWeighing(0, 10, true)).to.emit(arch,"PoolWeighingUpdated");

    })

    it("should call update pool, api left ot mint bigger then 0, controller total supply 0 ", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");

        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns(0)
        await arch.addNewPool(wantToken.address, mockController.address, 0, false);
        const blkNumber = await ethers.provider.getBlockNumber();
        await arch.updatePool(0);
        const poolInfo = await arch.poolInfo(0);
        expect(poolInfo.lastRewardBlock).to.be.equal(blkNumber+1);
    })

    it("should call update pool, block number equal pool last reward block", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");

        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns(0)
        await arch.addNewPool(wantToken.address, mockController.address, 0, false);
        await arch.setBlockNumber(0);

        const blkNumber = await ethers.provider.getBlockNumber();
        await arch.updatePool(0);
        const poolInfo = await arch.poolInfo(0);
        expect(poolInfo.lastRewardBlock).to.be.equal(blkNumber+1);
    })
    
    it("should call update pool, api left ot mint bigger then 0, controller total supply bigger then 0 ", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");

        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        const blkNumber = await ethers.provider.getBlockNumber();
        await arch.updatePool(0);
        const poolInfo = await arch.poolInfo(0);
        expect(poolInfo.lastRewardBlock).to.be.equal(blkNumber+1);
    })


    it("should call update pool, api left ot mint bigger then 0, controller total supply bigger then 0, pi tokens rewards bigger then 0 ", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000")

        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        const blkNumber = await ethers.provider.getBlockNumber();
        await arch.updatePool(0);
        const poolInfo = await arch.poolInfo(0);
        expect(poolInfo.lastRewardBlock).to.be.equal(blkNumber+1);
    })

    it("should call update pool, api left ot mint bigger then 0, controller total supply bigger then 0, pi tokens rewards bigger then 0, rewards bigger then left to mint ", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")

        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        const blkNumber = await ethers.provider.getBlockNumber();
        await arch.updatePool(0);
        const poolInfo = await arch.poolInfo(0);
        expect(poolInfo.lastRewardBlock).to.be.equal(blkNumber+1);
    })

    it("should call deposit, fail insuficient ammount", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")

        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await expect(arch.deposit(0, alice, 0, MOCK_ADDRESSV2)).to.be.revertedWith("Insufficient deposit");
    })

    it("should call deposit, fail not handler", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")

        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, bob);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await expect(arch.deposit(0, alice, 0, MOCK_ADDRESSV2)).to.be.revertedWith("Only handler");
    })

    it("should call deposit, user shares 0", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")

        const wantToken = await smock.fake(this.Token);
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.allowance.returns(0)

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await expect(arch.deposit(0, alice, "1000000000000000000", MOCK_ADDRESSV2)).to.emit(arch, "Deposit");
    })

    it("should call deposit, user shares bigger then 0, pending bigger then 0", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")
        await mockPiToken.balanceOf.returns(0)

        const wantToken = await smock.fake(this.Token);
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.balanceOf.returns(0)

        await wantToken.allowance.returns(0)

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await mockController.balanceOf.returns("10000000000000000000")
        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await arch.setAccPiTokenPerShare(0, 1);
        await expect(arch.deposit(0, alice, "1000000000000000000", MOCK_ADDRESSV2)).to.emit(arch, "Deposit");
    })

    it("should call deposit, user shares bigger then 0, pending 0", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns("0");
        await mockPiToken.apiMintPerBlock.returns("0")
        await mockPiToken.balanceOf.returns(0)

        const wantToken = await smock.fake(this.Token);
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.allowance.returns(0)
        await wantToken.balanceOf.returns(0)

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await mockController.balanceOf.returns("10000000000000000000")
        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await arch.setAccPiTokenPerShare(0, 0);
        await expect(arch.deposit(0, alice, "1000000000000000000", MOCK_ADDRESSV2)).to.emit(arch, "Deposit");
    })

    it("should call deposit, user shares bigger then 0, pending bigger then 0, go into swap for want", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")
        await mockPiToken.balanceOf.returns("10000000000000000000");
        await mockPiToken.transfer.returns(true);
        await mockPiToken.approve.returns(true);

        const wantToken = await smock.fake(this.Token , {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.balanceOf.returns(0)

        await wantToken.allowance.returns(0)


        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await mockController.balanceOf.returns("10000000000000000000")

        const priceFeedMock= await smock.fake(this.PriceFeed);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await arch.setVariable("oracles", {
           "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f" : priceFeedMock.address,
        })

        await arch.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])
        await arch.setVariable("exchange",uniswapRouterMock.address);

        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await arch.setAccPiTokenPerShare(0, 1);
        await expect(arch.deposit(0, alice, "1000000000000000000", MOCK_ADDRESSV2)).to.emit(arch, "Deposit");
    })


    it("should call deposit, user shares bigger then 0, pending 0", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns("0");
        await mockPiToken.apiMintPerBlock.returns("0")
        await mockPiToken.balanceOf.returns(0)

        const wantToken = await smock.fake(this.Token);
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.allowance.returns(0)
        await wantToken.balanceOf.returns(0)

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await mockController.balanceOf.returns("10000000000000000000")
        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await arch.setAccPiTokenPerShare(0, 0);
        await expect(arch.deposit(0, alice, "1000000000000000000", MOCK_ADDRESSV2)).to.emit(arch, "Deposit");
    })

    it("should call withdraw, fail 0 shares", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")
        await mockPiToken.balanceOf.returns("10000000000000000000");
        await mockPiToken.transfer.returns(true);
        await mockPiToken.approve.returns(true);

        const wantToken = await smock.fake(this.Token , {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.balanceOf.returns(0)

        await wantToken.allowance.returns(0)


        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await mockController.balanceOf.returns("10000000000000000000")

        const priceFeedMock= await smock.fake(this.PriceFeed);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await arch.setVariable("oracles", {
           "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f" : priceFeedMock.address,
        })

        await arch.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])
        await arch.setVariable("exchange",uniswapRouterMock.address);

        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await arch.setAccPiTokenPerShare(0, 1);
        await expect(arch.withdraw(0, alice, 0)).to.be.revertedWith("0 shares");
    })


    it("should call withdraw, user shares 1, fail not sufficient funds", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")
        await mockPiToken.balanceOf.returns("10000000000000000000");
        await mockPiToken.transfer.returns(true);
        await mockPiToken.approve.returns(true);

        const wantToken = await smock.fake(this.Token , {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.balanceOf.returns(0)

        await wantToken.allowance.returns(0)


        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await mockController.balanceOf.returns(0)

        const priceFeedMock= await smock.fake(this.PriceFeed);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await arch.setVariable("oracles", {
           "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f" : priceFeedMock.address,
        })

        await arch.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])
        await arch.setVariable("exchange",uniswapRouterMock.address);

        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await arch.setAccPiTokenPerShare(0, 1);
        await expect(arch.withdraw(0, alice, 1)).to.be.revertedWith("withdraw: not sufficient founds");
    })


    it("should call withdraw, user shares 1, fail can't withdraw from controller", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")
        await mockPiToken.balanceOf.returns("10000000000000000000");
        await mockPiToken.transfer.returns(true);
        await mockPiToken.approve.returns(true);

        const wantToken = await smock.fake(this.Token , {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.balanceOf.returns(0)

        await wantToken.allowance.returns(0)


        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await mockController.balanceOf.returns("100000000000000000");
        await mockController.withdraw.returns(0);

        const priceFeedMock= await smock.fake(this.PriceFeed);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await arch.setVariable("oracles", {
           "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f" : priceFeedMock.address,
        })

        await arch.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])
        await arch.setVariable("exchange",uniswapRouterMock.address);

        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await arch.setAccPiTokenPerShare(0, 1);
        await expect(arch.withdraw(0, alice, 1)).to.be.revertedWith("Can't withdraw from controller");
    })


    it("should call withdraw, user shares 1, worked", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")
        await mockPiToken.balanceOf.returns("10000000000000000000");
        await mockPiToken.transfer.returns(true);
        await mockPiToken.approve.returns(true);

        const wantToken = await smock.fake(this.Token , {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.balanceOf.returns(0)

        await wantToken.allowance.returns(0)
        await wantToken.transfer.returns(true);


        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await mockController.balanceOf.returns("100000000000000000");
        await mockController.withdraw.returns(1);

        const priceFeedMock= await smock.fake(this.PriceFeed);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await arch.setVariable("oracles", {
           "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f" : priceFeedMock.address,
        })

        await arch.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])
        await arch.setVariable("exchange",uniswapRouterMock.address);

        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await arch.setAccPiTokenPerShare(0, 1);
        await expect(arch.withdraw(0, alice, 1)).to.emit(arch, "Withdraw").withArgs("0", alice, "1");
    })


    it("should call emergency withdraw, all user shares, worked", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")
        await mockPiToken.balanceOf.returns("10000000000000000000");
        await mockPiToken.transfer.returns(true);
        await mockPiToken.approve.returns(true);

        const wantToken = await smock.fake(this.Token , {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.balanceOf.returns(0)

        await wantToken.allowance.returns(0)
        await wantToken.transfer.returns(true);


        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await mockController.balanceOf.returns("100000000000000000");
        await mockController.withdraw.returns(1);

        const priceFeedMock= await smock.fake(this.PriceFeed);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await arch.setVariable("oracles", {
           "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f" : priceFeedMock.address,
        })

        await arch.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])
        await arch.setVariable("exchange",uniswapRouterMock.address);

        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await arch.setAccPiTokenPerShare(0, 1);
        await arch.setVariable("handler",bob);
        await expect(arch.emergencyWithdraw(0, alice)).to.emit(arch, "EmergencyWithdraw").withArgs("0", alice, "100000000000000000");
    })



    it("should call emergency withdraw, all user shares, fail not authorized", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")
        await mockPiToken.balanceOf.returns("10000000000000000000");
        await mockPiToken.transfer.returns(true);
        await mockPiToken.approve.returns(true);

        const wantToken = await smock.fake(this.Token , {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.balanceOf.returns(0)

        await wantToken.allowance.returns(0)
        await wantToken.transfer.returns(true);


        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await mockController.balanceOf.returns("100000000000000000");
        await mockController.withdraw.returns(1);

        const priceFeedMock= await smock.fake(this.PriceFeed);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await arch.setVariable("oracles", {
           "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f" : priceFeedMock.address,
        })

        await arch.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])
        await arch.setVariable("exchange",uniswapRouterMock.address);

        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await arch.setAccPiTokenPerShare(0, 1);
        await expect(arch.connect(carolAccount).emergencyWithdraw(0, alice)).to.be.revertedWith("Not authorized");
    })


    it("should call harvest all, worked, emit harvested", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")
        await mockPiToken.balanceOf.returns("10000000000000000000");
        await mockPiToken.transfer.returns(true);
        await mockPiToken.approve.returns(true);

        const wantToken = await smock.fake(this.Token , {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.balanceOf.returns(0)

        await wantToken.allowance.returns(0)
        await wantToken.transfer.returns(true);


        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await mockController.balanceOf.returns("100000000000000000");
        await mockController.withdraw.returns(1);

        const priceFeedMock= await smock.fake(this.PriceFeed);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await arch.setVariable("oracles", {
           "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f" : priceFeedMock.address,
        })

        await arch.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])
        await arch.setVariable("exchange",uniswapRouterMock.address);

        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await arch.setAccPiTokenPerShare(0, 1);
        await expect(arch.harvestAll(alice)).to.emit(arch,"Harvested");
    })



    it("should call harvest all, worked, shares 0, get out at first", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")
        await mockPiToken.balanceOf.returns("10000000000000000000");
        await mockPiToken.transfer.returns(true);
        await mockPiToken.approve.returns(true);

        const wantToken = await smock.fake(this.Token , {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.balanceOf.returnsAtCall(0, "10000000000000000000");
        await wantToken.balanceOf.returnsAtCall(0, "1000000000000000");
         

        await wantToken.allowance.returns(0)
        await wantToken.transfer.returns(true);


        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await mockController.balanceOf.returns("0");
        await mockController.withdraw.returns(1);

        const priceFeedMock= await smock.fake(this.PriceFeed);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await arch.setVariable("oracles", {
           "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f" : priceFeedMock.address,
        })

        await arch.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])
        await arch.setVariable("exchange",uniswapRouterMock.address);

        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await arch.setAccPiTokenPerShare(0, 1);
        await expect(arch.harvestAll(alice)).to.not.emit(arch,"Harvested");
    })


    it("should call harvest all, worked, balance bigger then 0, go in deposit controller, harvested emitted", async()=>{
        const mockController = await smock.fake(this.Controller);

        const mockPiToken = await smock.fake(this.PiToken, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await mockPiToken.apiLeftToMint.returns("10000000000000000000");
        await mockPiToken.apiMintPerBlock.returns("100000000000000000000000000000000")
        await mockPiToken.balanceOf.returns("10000000000000000000");
        await mockPiToken.transfer.returns(true);
        await mockPiToken.approve.returns(true);

        const wantToken = await smock.fake(this.Token , {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await wantToken.transferFrom.returns(true);
        await wantToken.approve.returns(true);
        await wantToken.balanceOf.returnsAtCall(0, "1000000000000000");
        await wantToken.balanceOf.returnsAtCall(1, "10000000000000000000");
         

        await wantToken.allowance.returns(0)
        await wantToken.transfer.returns(true);


        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, alice);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.totalSupply.returns("10000000000000000000");
        await mockController.balanceOf.returns("100000000000000000");
        await mockController.withdraw.returns(1);

        const priceFeedMock= await smock.fake(this.PriceFeed);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await arch.setVariable("oracles", {
           "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f" : priceFeedMock.address,
        })

        await arch.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])
        await arch.setVariable("exchange",uniswapRouterMock.address);

        await arch.addNewPool(wantToken.address, mockController.address, 1, false);
        await arch.setAccPiTokenPerShare(0, 1);
        await expect(arch.harvestAll(alice)).to.emit(arch,"Harvested");
    })


    it("should call before shares transfer and after shares transfer reverts", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESS);
        await expect(arch.beforeSharesTransfer(0,ZERO_ADDRESS,ZERO_ADDRESS,0)).to.be.revertedWith("API shares are handled by handler at the momen")
        await expect(arch.afterSharesTransfer(0,ZERO_ADDRESS,ZERO_ADDRESS,0)).to.be.revertedWith("API shares are handled by handler at the momen")
        
    })



    it("should set refferal, fail same address", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESSV2);
        const oldExch = await arch.referralMgr()
        await expect(arch.setReferralAddress(oldExch)).to.be.revertedWith("Same Manager")
    })

    it("should set refferal, fail zero address", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESSV2);
        const oldExch = await arch.referralMgr()
        await arch.setVariable("referralMgr", MOCK_ADDRESSV2);
        await expect(arch.setReferralAddress(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress");
    })

    it("should set refferal, works", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESS);
        const oldExch = await arch.referralMgr()
        await arch.setReferralAddress(MOCK_ADDRESSV2);
        const newRfr = await arch.referralMgr();
        expect(oldExch).to.not.be.equal(newRfr);
    })



    
    it("should set refferal, fail same address", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESSV2);
        const oldExch = await arch.referralCommissionRate()
        await expect(arch.setReferralCommissionRate(oldExch)).to.be.revertedWith("Same rate")
    })

    it("should set refferal, fail zero address", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESSV2);
        const oldExch = await arch.referralCommissionRate()
        await arch.setVariable("referralMgr", MOCK_ADDRESSV2);
        await expect(arch.setReferralCommissionRate(55)).to.be.revertedWith("rate greater than MaxCommission");
    })

    it("should set refferal, works", async()=>{
        const arch = await this.ArchimedesAPI.deploy(MOCK_ADDRESS, "1000000000", MOCK_ADDRESS);
        const oldExch = await arch.referralCommissionRate()
        await arch.setReferralCommissionRate(1);
        const newRfr = await arch.referralCommissionRate();
        expect(oldExch).to.not.be.equal(newRfr);
    })



    it("call the views, check", async()=>{
        const mockController = await smock.fake(this.Controller);
        await mockController.decimals.returns(18);
        const mockPiToken = await smock.fake(this.Token);


        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await expect(arch.addNewPool(ZERO_ADDRESS, ZERO_ADDRESS, 0, false)).to.be.revertedWith("Address zero not allowed")
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.be.revertedWith("Not an Archimedes controller")
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.balance.returns(1);
        await mockController.balanceOf.returns(1);
        await mockController.totalSupply.returns(0);
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.emit(arch, "NewPool")

        const decimals = await arch.decimals(0);
        const balance = await arch.balance(0);
        const balanceOf = await arch.balanceOf(0,alice);
        const length = await arch.poolLength();
        const price = await arch.getPricePerFullShare(0);
        expect(decimals.toString()).to.be.equal("18");
        expect(balance.toString()).to.be.equal("1");
        expect(balanceOf.toString()).to.be.equal("1");
        expect(length.toString()).to.be.equal("1");
        expect(price.toString()).to.be.equal("1000000000000000000");


    })


    it("call reddem stuck pi tokens, fail still minting", async()=>{
        const mockController = await smock.fake(this.Controller);
        await mockController.decimals.returns(18);
        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.totalSupply.returns(0);  
        await mockPiToken.MAX_SUPPLY.returns(1);

        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.balance.returns(1);
        await mockController.balanceOf.returns(1);
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.emit(arch, "NewPool")
        
        await expect(arch.redeemStuckedPiTokens()).to.be.revertedWith("PiToken still minting");

    })


    it("call reddem stuck pi tokens, fail still waiting", async()=>{
        const mockController = await smock.fake(this.Controller);
        await mockController.decimals.returns(18);
        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.totalSupply.returns(0);  
        await mockPiToken.MAX_SUPPLY.returns(0);

        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.balance.returns(1);
        await mockController.balanceOf.returns(1);
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.emit(arch, "NewPool")

        await expect(arch.redeemStuckedPiTokens()).to.be.revertedWith("Still waiting");
    })

    it("call reddem stuck pi tokens, balance 0, not go into if", async()=>{
        const mockController = await smock.fake(this.Controller);
        await mockController.decimals.returns(18);
        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.totalSupply.returns(0);  
        await mockPiToken.MAX_SUPPLY.returns(0);
        await mockPiToken.balanceOf.returns(0);

        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.balance.returns(1);
        await mockController.balanceOf.returns(1);
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.emit(arch, "NewPool")
        await arch.setBlockNumber("1000000000000000000")
        await arch.redeemStuckedPiTokens();
        expect(mockPiToken.balanceOf).to.have.callCount(1);

    })

    it("call reddem stuck pi tokens, balance greater then 0, go into if", async()=>{
        const mockController = await smock.fake(this.Controller);
        await mockController.decimals.returns(18);
        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.totalSupply.returns(0);  
        await mockPiToken.MAX_SUPPLY.returns(0);
        await mockPiToken.balanceOf.returns(1);
        await mockPiToken.transfer.returns(true);

        const wantToken = await smock.fake(this.Token);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);
        await mockController.archimedes.returns(ZERO_ADDRESS);
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
        await mockController.balance.returns(1);
        await mockController.balanceOf.returns(1);
        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.emit(arch, "NewPool")
        await arch.setBlockNumber("1000000000000000000")
        await arch.redeemStuckedPiTokens();
        expect(mockPiToken.balanceOf).to.have.callCount(1);
    })

    it("call pay refferal commision, refferal mgr valid, refferal commision rate bigger then 0, commision 0",async()=>{
        const mockPiToken = await smock.fake(this.PiToken);
        const mockRef = await smock.fake(this.Referral);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);

        await arch.setReferralAddress(mockRef.address);
        await arch.setReferralCommissionRate(1);

        await arch.callPayReferralCommission(0, alice, 0);
        expect(mockRef.getReferrer).to.have.callCount(1);
    })

    it("call pay refferal commision, refferal mgr valid, refferal commision rate bigger then 0, commision bigger then 0, api smaller then commision",async()=>{
        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns(0);

        const mockRef = await smock.fake(this.Referral);
        await mockRef.getReferrer.returns(MOCK_ADDRESSV2);

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);

        await arch.setReferralAddress(mockRef.address);
        await arch.setReferralCommissionRate(1);

        await arch.callPayReferralCommission(0, alice, 1000);
        expect(mockRef.getReferrer).to.have.callCount(1);

    })

    it("call pay refferal commision, refferal mgr valid, refferal commision rate bigger then 0, commision bigger then 0, api bigger then commision",async()=>{
        const mockPiToken = await smock.fake(this.PiToken);
        await mockPiToken.apiLeftToMint.returns("5000000");

        const mockRef = await smock.fake(this.Referral);
        await mockRef.getReferrer.returns(MOCK_ADDRESSV2);
        await mockRef.referralPaid.returns();

        const blk = await ethers.provider.getBlock("latest");
        const arch = await this.ArchimedesAPI.deploy(mockPiToken.address, blk.number+2, MOCK_ADDRESS);


        const mockController = await smock.fake(this.Controller);
        await mockController.archimedes.returns(arch.address);
        await mockController.strategy.returns(MOCK_ADDRESSV2);
        await mockController.setPid.returns(0)
  


        const wantToken = await smock.fake(this.Token);
        await wantToken.transfer.returns(true);

        await expect(arch.addNewPool(wantToken.address, mockController.address, 0, false)).to.emit(arch, "NewPool")


        await arch.setReferralAddress(mockRef.address);
        await arch.setReferralCommissionRate(2);

        await arch.callPayReferralCommission(0, alice, 5000);
        expect(mockRef.getReferrer).to.have.callCount(1);

    })


    it("check block number, work", async()=>{
        const mockPiToken = await smock.fake(this.Token);
        const ArchAPI = await ethers.getContractFactory("ArchimedesAPIMockV3");
        const blk = await ethers.provider.getBlockNumber();

        const arch = await ArchAPI.deploy(mockPiToken.address, blk+2, alice);
        const blockNumber = await ethers.provider.getBlockNumber();
        const _blockNumber = await arch.getBlockNumber();
        expect(blockNumber).to.be.equal(_blockNumber);
    })
    

})