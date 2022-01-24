const chai = require('chai')
const expect = chai.expect 
const { deployMockContract } = require("ethereum-waffle");
const { isBytes, zeroPad } = require("ethers/lib/utils");
const { wallfe, ethers } = require("hardhat");
const ZERO_ADDRESS = ethers.constants.AddressZero;
const MOCK_ADDRESS = '0x' + '1'.repeat(40)
const MOCK_ADDRESSV2 = '0x' + '2'.repeat(40)

const { smock } = require("@defi-wonderland/smock");
const { BigNumber } = require('ethers');
chai.use(smock.matchers);


describe("Swappable", ()=>{
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
        this.Token = await ethers.getContractFactory("TokenMock");
        this.PriceFeed = await ethers.getContractFactory("PriceFeedMock");
        this.Swappable = await smock.mock("SwappableMock");
    })


    it("should set swap slippage ratio, fail same ratio", async()=>{
        const swp = await this.Swappable.deploy();
        const swpSlippageRatio = await swp.swapSlippageRatio();
        await expect(swp.setSwapSlippageRatio(swpSlippageRatio)).to.be.revertedWith("Same ratio")
    })

    it("should set swap slippage ratio, fail more then 100%", async()=>{
        const swp = await this.Swappable.deploy();
        await expect(swp.setSwapSlippageRatio(10001)).to.be.revertedWith("Can't be more than 100%'")
    })

    it("should set swap slippage ratio should work", async()=>{
        const swp = await this.Swappable.deploy();
        const oldSwapRatio = await swp.swapSlippageRatio();
        await swp.setSwapSlippageRatio(200);
        const newSwapRatio = await swp.swapSlippageRatio();
        expect(newSwapRatio).to.not.be.equal(oldSwapRatio);
        expect(newSwapRatio.toString()).to.be.equal("200")
    })


    it("should set max price offset, fail same ratio", async()=>{
        const swp = await this.Swappable.deploy();
        const maxPriceOffset = await swp.maxPriceOffset();
        await expect(swp.setMaxPriceOffset(maxPriceOffset)).to.be.revertedWith("Same offset")
    })

    it("should set max price offset, fail more then 100%", async()=>{
        const swp = await this.Swappable.deploy();
        await expect(swp.setMaxPriceOffset(86401)).to.be.revertedWith("Can't be more than 1 day")
    })

    it("should set max price offset should work", async()=>{
        const swp = await this.Swappable.deploy();
        const oldMaxPriceOffset = await swp.maxPriceOffset();
        await swp.setMaxPriceOffset(200);
        const newMaxPriceOffset = await swp.maxPriceOffset();
        expect(newMaxPriceOffset).to.not.be.equal(oldMaxPriceOffset);
        expect(newMaxPriceOffset.toString()).to.be.equal("200")
    })


    it("should set price feed, fail zero address", async()=>{
        const swp = await this.Swappable.deploy();
        await expect(swp.setPriceFeed(ZERO_ADDRESS, ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress")
    })

    it("should set price feed, invalid feed", async()=>{
        const swp = await this.Swappable.deploy();
        const priceFeedMock= await smock.fake(this.PriceFeed);
        await priceFeedMock.latestRoundData.returns([0, 0, 0, 0, 0])

        await expect(swp.setPriceFeed(MOCK_ADDRESS, priceFeedMock.address)).to.be.revertedWith("Invalid feed")
    })

    it("should set price feed should work", async()=>{
        const swp = await this.Swappable.deploy();
        const priceFeedMock= await smock.fake(this.PriceFeed);
        await priceFeedMock.latestRoundData.returns([1, 1, 0, 0, 0])

        await swp.setPriceFeed(MOCK_ADDRESS, priceFeedMock.address);
        const feed = await swp.oracles(MOCK_ADDRESS);
        expect(feed).to.be.equal(priceFeedMock.address);

    })

    it("should call get price  should fail old price", async()=>{
        const mockToken = await smock.fake(this.Token, {address: "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243"});
        const swp = await this.Swappable.deploy();
        const priceFeedMock= await smock.fake(this.PriceFeed);
        await priceFeedMock.latestRoundData.returns([1, 0, 0, 0, 0])

        await swp.setVariable("oracles", {
            "0x5eBb09b90aE26d8572dEBfEae4E0fF1D441d6243": priceFeedMock.address
        })

        await swp.setVariable("maxPriceOffset", 0)

        await expect(swp.callMockGetPriceFor(mockToken.address)).to.be.revertedWith("Old price");

    })
})