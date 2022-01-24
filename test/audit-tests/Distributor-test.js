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


describe("Distributor", ()=>{
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
        this.PiVault = await ethers.getContractFactory("PiVault");
        this.Token = await ethers.getContractFactory("TokenMock");
        this.Distributor = await smock.mock("Distributor")
    })

    it("should deploy", async()=>{
        const mockPiToken = await smock.fake(this.Token);
        const mockVault = await smock.fake(this.PiVault);
        const dist = await this.Distributor.deploy(mockPiToken.address, mockVault.address, MOCK_ADDRESS);
        const token = await dist.piToken();
        expect(token).to.be.equal(mockPiToken.address);
    })

    it("shou set treasury, fail same address", async()=>{
        const mockPiToken = await smock.fake(this.Token);
        const mockVault = await smock.fake(this.PiVault);
        const dist = await this.Distributor.deploy(mockPiToken.address, mockVault.address, MOCK_ADDRESS);
        await expect(dist.setTreasury(MOCK_ADDRESS)).to.be.revertedWith("Same address");
    })

    it("shou set treasury, fail zero address", async()=>{
        const mockPiToken = await smock.fake(this.Token);
        const mockVault = await smock.fake(this.PiVault);
        const dist = await this.Distributor.deploy(mockPiToken.address, mockVault.address, MOCK_ADDRESS);
        await expect(dist.setTreasury(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress");
    })

    it("shou set treasury, works ", async()=>{
        const mockPiToken = await smock.fake(this.Token);
        const mockVault = await smock.fake(this.PiVault);
        const dist = await this.Distributor.deploy(mockPiToken.address, mockVault.address, MOCK_ADDRESS);
        await expect(dist.setTreasury(MOCK_ADDRESSV2)).to.emit(dist, "NewTreasury").withArgs(MOCK_ADDRESS, MOCK_ADDRESSV2);
    })



    it("should call dsitribute, fail have to wait", async()=>{
        const mockPiToken = await smock.fake(this.Token);
        const mockVault = await smock.fake(this.PiVault);
        const dist = await this.Distributor.deploy(mockPiToken.address, mockVault.address, MOCK_ADDRESS);
        const blk = await ethers.provider.getBlock("latest");
        await dist.setVariable("lastBlock", blk.number+100);
        await expect(dist.distribute()).to.be.revertedWith("Have to wait");
    })

    it("should call dsitribute, fail nothing more to do", async()=>{
        const mockPiToken = await smock.fake(this.Token);
        const mockVault = await smock.fake(this.PiVault);
        const dist = await this.Distributor.deploy(mockPiToken.address, mockVault.address, MOCK_ADDRESS);
        const blk = await ethers.provider.getBlock("latest");
        await dist.setVariable("lastBlock", 0);

        await dist.setVariable("leftTokensForInvestors", 0);

        await dist.setVariable("leftTokensForFounders", 0);

        await dist.setVariable("leftTokensForTreasury", 0);

        await expect(dist.distribute()).to.be.revertedWith("Nothing more to do");
    })

    it("should call dsitribute, multiplier 0, tokens for investors 0", async()=>{
        const mockPiToken = await smock.fake(this.Token);
        mockPiToken.approve.returns(true);
        const mockVault = await smock.fake(this.PiVault);
        await mockVault.transfer.returns(true);
        const dist = await this.Distributor.deploy(mockPiToken.address, mockVault.address, MOCK_ADDRESS);
        const blk = await ethers.provider.getBlock("latest");
        await dist.setVariable("lastBlock", blk.number);

        await dist.setVariable("leftTokensForInvestors", 0);

        await expect(dist.distribute()).to.emit(dist, "FoundersDistributed").to.emit(dist,"TreasoryDistributed");
    })

    it("should call dsitribute, fail nothing more to do, multiplier 0, tokens for investors bigger then 0", async()=>{
        const mockPiToken = await smock.fake(this.Token);
        mockPiToken.approve.returns(true);
        const mockVault = await smock.fake(this.PiVault);
        await mockVault.transfer.returns(true);
        const dist = await this.Distributor.deploy(mockPiToken.address, mockVault.address, MOCK_ADDRESS);
        const blk = await ethers.provider.getBlock("latest");
        await dist.setVariable("lastBlock", blk.number)

        await expect(dist.distribute()).to.emit(dist, "InvestorsDistributed").to.emit(dist, "FoundersDistributed").to.emit(dist, "TreasoryDistributed");
    })

    it("should call dsitribute, fail nothing more to do, multiplier 0, tokens for founder 0", async()=>{
        const mockPiToken = await smock.fake(this.Token)
        mockPiToken.approve.returns(true);
        const mockVault = await smock.fake(this.PiVault);
        await mockVault.transfer.returns(true);
        await mockVault.balanceOf.returns(1);
        const dist = await this.Distributor.deploy(mockPiToken.address, mockVault.address, MOCK_ADDRESS);
        const blk = await ethers.provider.getBlock("latest");
        await dist.setVariable("lastBlock", blk.number);

        await dist.setVariable("leftTokensForFounders", 0);

        await expect(dist.distribute()).to.emit(dist, "TreasoryDistributed");
    })

    it("should call dsitribute, fail nothing more to do, multiplier 0, tokens for treasury 0", async()=>{
        const mockPiToken = await smock.fake(this.Token);
        mockPiToken.approve.returns(true);
        const mockVault = await smock.fake(this.PiVault);
        await mockVault.transfer.returns(true);
        const dist = await this.Distributor.deploy(mockPiToken.address, mockVault.address, MOCK_ADDRESS);
        const blk = await ethers.provider.getBlock("latest");
        await dist.setVariable("lastBlock", blk.number);

        await dist.setVariable("leftTokensForTreasury", 0);

        await expect(dist.distribute()).to.emit(dist, "FoundersDistributed");
    })

    it("should call dsitribute, fail nothing more to do, multiplier 10, tokens for treasury  and founders 1", async()=>{
        const mockPiToken = await smock.fake(this.Token);
        mockPiToken.approve.returns(true);
        const mockVault = await smock.fake(this.PiVault);
        await mockVault.transfer.returns(true);
        const dist = await this.Distributor.deploy(mockPiToken.address, mockVault.address, MOCK_ADDRESS);
        const blk = await ethers.provider.getBlock("latest");
        await dist.setVariable("lastBlock", blk.number-10);

        await dist.setVariable("leftTokensForFounders", 1);

        await dist.setVariable("leftTokensForTreasury", 1);

        await expect(dist.distribute()).to.emit(dist, "FoundersDistributed").to.emit(dist, "TreasoryDistributed");
    })

    it("should call dsitribute, fail nothing more to do, multiplier 10, tokens for investors 1", async()=>{
        const mockPiToken = await smock.fake(this.Token);
        mockPiToken.approve.returns(true);
        const mockVault = await smock.fake(this.PiVault);
        await mockVault.transfer.returns(true);
        const dist = await this.Distributor.deploy(mockPiToken.address, mockVault.address, MOCK_ADDRESS);
        const blk = await ethers.provider.getBlock("latest");
        await dist.setVariable("lastBlock", blk.number-10);

        await dist.setVariable("leftTokensForInvestors", 1);

        await expect(dist.distribute()).to.emit(dist, "InvestorsDistributed");
    })


})