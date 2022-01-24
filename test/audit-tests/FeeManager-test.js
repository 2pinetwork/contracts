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



describe("FeeManager", ()=>{
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
        this.FeeManager = await smock.mock("FeeManager")
    })

    it("deploy fail treasury zero address", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        mockPiVault.piToken.returns(MOCK_ADDRESSV2)
        await expect(this.FeeManager.deploy(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress treasury");
        await expect(this.FeeManager.deploy(MOCK_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress exchange");
        await expect(this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS)).to.be.revertedWith("Not PiToken vault");

    })

    it("deploy success", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        let trs = await manager.treasury();
        expect(trs).to.be.equal(MOCK_ADDRESS);
    })

    it("should call harvest, balance 0 ", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token);
        await mockPiToken.balanceOf.returns(0)
        mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await expect(manager.harvest(mockPiToken.address)).to.not.emit(manager, "Harvest");
    })

    it("should call harvest, balance greater then 0, not native", async()=>{ 
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")


        const piToken = await smock.fake(this.Token, {address: "0x5095d3313C76E8d29163e40a0223A5816a8037D8"});
        await piToken.transfer.returns(true);


        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])

        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, uniswapRouterMock.address);
        
        const blk = await ethers.provider.getBlock("latest");

        const priceFeedMock= await smock.fake(this.PriceFeed);
        await priceFeedMock.latestRoundData.returns([1, 1, blk.timestamp+600, blk.timestamp+600, 1])
        


        await manager.setVariable("oracles", {
            "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243": priceFeedMock.address,
            "0x5095d3313C76E8d29163e40a0223A5816a8037D8": priceFeedMock.address
        })

        await expect(manager.harvest(mockPiToken.address)).to.emit(manager, "Harvest");
    })


    it("set treasury, fail same address", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await expect(manager.setTreasury(MOCK_ADDRESS)).to.be.revertedWith("Same Address");
    })

    it("set treasury, fail zero address", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await expect(manager.setTreasury(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress");
    })

    it("set treasury, works", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await expect(manager.setTreasury(MOCK_ADDRESSV2)).to.emit(manager, "NewTreasury").withArgs(MOCK_ADDRESS, MOCK_ADDRESSV2);
    })


    it("set treasury ratio, fail same ratio", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await expect(manager.setTreasuryRatio(150)).to.be.revertedWith("Same ratio");
    })

    it("set treasury, fail greater then 50%", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await expect(manager.setTreasuryRatio(50001)).to.be.revertedWith("Can't be greater than 50%");
    })

    it("set treasury, works", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await expect(manager.setTreasuryRatio(499)).to.emit(manager, "NewTreasuryRatio");
    })



    it("set exchange, fail same address", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await expect(manager.setExchange(MOCK_ADDRESS)).to.be.revertedWith("Same Address");
    })

    it("set exchange, fail zero address", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await expect(manager.setExchange(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress");
    })

    it("set exchange, works", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await expect(manager.setExchange(MOCK_ADDRESSV2)).to.emit(manager, "NewExchange").withArgs(MOCK_ADDRESS, MOCK_ADDRESSV2);
    })



    it("set route, fail address zero", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await expect(manager.setRoute(ZERO_ADDRESS, [MOCK_ADDRESS, MOCK_ADDRESSV2])).to.be.revertedWith("!ZeroAddress");
    })

    it("set route, fail invalid router, router smaller then 2", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await expect(manager.setRoute(MOCK_ADDRESS, [MOCK_ADDRESS])).to.be.revertedWith("Invalid route");
    })

    it("set route, fail invalid router, router smaller then 2", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await expect(manager.setRoute(MOCK_ADDRESS, [MOCK_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS])).to.be.revertedWith("Route with ZeroAddress");
    })

    it("set route, works", async()=>{
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")
        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, MOCK_ADDRESS);
        await manager.setRoute(MOCK_ADDRESS, [MOCK_ADDRESS, MOCK_ADDRESSV2, MOCK_ADDRESSV2]);
        const r1 = await manager.routes(MOCK_ADDRESS, 0);
        const r2 = await manager.routes(MOCK_ADDRESS, 1);
        const r3 = await manager.routes(MOCK_ADDRESS, 2);
        expect(r1).to.be.equal(MOCK_ADDRESS);
        expect(r2).to.be.equal(MOCK_ADDRESSV2);
        expect(r3).to.be.equal(MOCK_ADDRESSV2);

    })



    it("should call harvest, balance greater then 0, route length bigger then 0", async()=>{  
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")


        const piToken = await smock.fake(this.Token, {address: "0x5095d3313C76E8d29163e40a0223A5816a8037D8"});
        await piToken.transfer.returns(true);


        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])

        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, uniswapRouterMock.address);
        
        const blk = await ethers.provider.getBlock("latest");

        const priceFeedMock= await smock.fake(this.PriceFeed);
        await priceFeedMock.latestRoundData.returns([1, 1, blk.timestamp+600, blk.timestamp+600, 1])
        


        await manager.setVariable("oracles", {
            "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243": priceFeedMock.address,
            "0x5095d3313C76E8d29163e40a0223A5816a8037D8": priceFeedMock.address
        })

        await manager.setRoute(mockPiToken.address, [MOCK_ADDRESS, MOCK_ADDRESSV2, MOCK_ADDRESSV2]);


        await expect(manager.harvest(mockPiToken.address)).to.emit(manager, "Harvest");
    })

    it("should call harvest, balance greater then 0, native true", async()=>{  
        const mockPiVault = await smock.fake(this.PiVault);
        const mockPiToken = await smock.fake(this.Token, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await mockPiToken.balanceOf.returns(1)
        await mockPiToken.approve.returns(true);
        await mockPiVault.piToken.returns("0x5095d3313C76E8d29163e40a0223A5816a8037D8")


        const piToken = await smock.fake(this.Token, {address: "0x5095d3313C76E8d29163e40a0223A5816a8037D8"});
        await piToken.transfer.returns(true);


        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])

        const manager =  await this.FeeManager.deploy(MOCK_ADDRESS, mockPiVault.address, uniswapRouterMock.address);
        
        const blk = await ethers.provider.getBlock("latest");

        const priceFeedMock= await smock.fake(this.PriceFeed);
        await priceFeedMock.latestRoundData.returns([1, 1, blk.timestamp+600, blk.timestamp+600, 1])
        


        await manager.setVariable("oracles", {
            "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f": priceFeedMock.address,
            "0x5095d3313C76E8d29163e40a0223A5816a8037D8": priceFeedMock.address
        })


        await expect(manager.harvest(mockPiToken.address)).to.emit(manager, "Harvest");
    })


})