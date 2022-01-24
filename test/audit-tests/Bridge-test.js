const chai = require('chai')
const expect = chai.expect 
const { deployMockContract } = require("ethereum-waffle");
const { isBytes } = require("ethers/lib/utils");
const { wallfe, ethers } = require("hardhat");
const ZERO_ADDRESS = ethers.constants.AddressZero;
const MOCK_ADDRESS = '0x' + '1'.repeat(40)
const MockPiToken = require("../../artifacts/contracts/auditMocs/IMockPiToken.sol/IMockPiToken.json")

const { smock } = require("@defi-wonderland/smock");
const { BigNumber } = require('ethers');
chai.use(smock.matchers);


describe("BridgePiToken", ()=>{

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
        this.Bridge = await ethers.getContractFactory("BridgePiTokenMockV2");
    })

    it("deploy new bridge, should work", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        const blkNumber = await ethers.provider.getBlockNumber();
        await bridge.initRewardsOn(0);
        const blockNumber = await bridge.getTranschesBlock();
        
        expect(blockNumber).to.be.equal("0");
    })

    it("deploy new bridge, should fail, already set", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.setBlockNumber(0);
        await bridge.initRewardsOn(100);
        await expect(bridge.initRewardsOn(0)).to.be.revertedWith("Already set");
    })

    it("should set community mint per block, fail same rate", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        const rate = await bridge.communityMintPerBlock();
        await expect(bridge.setCommunityMintPerBlock(rate)).to.be.revertedWith("Same rate");
    })

    it("should set community mint per block, work", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.setCommunityMintPerBlock(1);
        const rate = await bridge.communityMintPerBlock();
        expect(rate.toString()).to.be.equal("1");
    })

    it("should api rate mint per block, fail same rate", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        const rate = await bridge.apiMintPerBlock();
        await expect(bridge.setApiMintPerBlock(rate)).to.be.revertedWith("Same rate");
    })

    it("should api rate mint per block, work", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.setApiMintPerBlock(1);
        const rate = await bridge.apiMintPerBlock();
        expect(rate.toString()).to.be.equal("1");
    })

    it("should add minter, work", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.addMinter(MOCK_ADDRESS);
        const res = await bridge.hasRole(await bridge.MINTER_ROLE(), MOCK_ADDRESS);
        expect(res).to.be.equal(true);
    })

    it("should call available, work", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(1);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        const res = await bridge.available()
        expect(res.toString()).to.be.equal("1");
    })

    it("should call community mint, fail only minters", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(1);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await expect(bridge.communityMint(alice, 1)).to.be.revertedWith("Only minters");
    })

    it("should call community mint, can not mint to zero address", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(1);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.addMinter(alice);
        await expect(bridge.communityMint(ZERO_ADDRESS, 1)).to.be.revertedWith("Can't mint to zero address");
    })

    it("should call community mint, fail insuficient supply", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(1);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.addMinter(alice);
        await expect(bridge.communityMint(alice, 0)).to.be.revertedWith("Insufficient supply");
    })

    it("should call community mint, rewards not initialized", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(1);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.addMinter(alice);
        await bridge.mockSetTranschesBlock(0);
        await expect(bridge.communityMint(alice, 1)).to.be.revertedWith("Rewards not initialized");
    })

    it("should call community mint, still waiting for rewards block", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(1);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.addMinter(alice);
        await bridge.mockSetTranschesBlock(10000);
        await bridge.setBlockNumber(1);
        await expect(bridge.communityMint(alice, 1)).to.be.revertedWith("Still waiting for rewards block");
    })

    it("should call community mint, can't mint more than available", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(1);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.addMinter(alice);
        await bridge.mockSetTranschesBlock(1);
        await expect(bridge.communityMint(alice, 2)).to.be.revertedWith("Can't mint more than available");
    })

    it("should call community mint, fail mint ration is zero", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(10);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.addMinter(alice);
        await bridge.mockSetTranschesBlock(1);
        await expect(bridge.communityMint(alice, 1)).to.be.revertedWith("Mint ratio is 0");
    })

    it("should call community mint, work", async()=>{
        const mockPiToken = await smock.fake("PiTokenMockV2");
        await mockPiToken.balanceOf.returns(10);
        await mockPiToken.transfer.returns(true);
        const Bridge = await smock.mock("BridgePiTokenMockV2");
        const bridge = await Bridge.deploy(mockPiToken.address);
        await bridge.setCommunityMintPerBlock(1);
        await bridge.addMinter(alice);
        await bridge.mockSetTranschesBlock(1);
        await bridge.communityMint(alice, 1);
        expect(mockPiToken.transfer).to.have.callCount(1);
    })

    it("should call api mint, work", async()=>{
        const mockPiToken = await smock.fake("PiTokenMockV2");
        await mockPiToken.balanceOf.returns(10);
        await mockPiToken.transfer.returns(true);
        const Bridge = await smock.mock("BridgePiTokenMockV2");
        const bridge = await Bridge.deploy(mockPiToken.address);        
        await bridge.setApiMintPerBlock(1);
        await bridge.addMinter(alice);
        await bridge.mockSetTranschesBlock(1);
        await bridge.apiMint(alice, 1);
        expect(mockPiToken.transfer).to.have.callCount(1);
    })

    it("should call community left to mint,", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(10);
        await mockPiToken.mock.transfer.returns(true);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.setCommunityMintPerBlock(1);
        await bridge.addMinter(alice);
        await bridge.mockSetTranschesBlock(1);
        const res = await bridge.communityLeftToMint();
        expect(res.toString()).to.be.equal("10");
    })

    it("should call api left to mint,", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(10);
        await mockPiToken.mock.transfer.returns(true);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.setApiMintPerBlock(1);
        await bridge.addMinter(alice);
        await bridge.mockSetTranschesBlock(1);
        const res = await bridge.apiLeftToMint();
        expect(res.toString()).to.be.equal("10");
    })

    it("should call balance of, work", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(10);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        const res = await bridge.balanceOf(alice);
        expect(res.toString()).to.be.equal("10");
    })

    it("should call api mint, fail can't mint more then expected", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns("30000000");
        await mockPiToken.mock.transfer.returns(true);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.setApiMintPerBlock(1);
        await bridge.addMinter(alice);
        await bridge.mockSetTranschesBlock(1);
        await expect(bridge.apiMint(alice, '30000000')).to.be.revertedWith("Can't mint more than expected");
    })

    it("should call community mint, fail can't mint more then expected", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns("30000000");
        await mockPiToken.mock.transfer.returns(true);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.setCommunityMintPerBlock(1);
        await bridge.addMinter(alice);
        await bridge.mockSetTranschesBlock(1);
        await expect(bridge.communityMint(alice, '30000000')).to.be.revertedWith("Can't mint more than expected");
    })

    it("should call api mint, work, old tranche", async()=>{
        const mockPiToken = await smock.fake("PiTokenMockV2");
        await mockPiToken.balanceOf.returns("30000000");
        await mockPiToken.transfer.returns(true);
        const Bridge = await smock.mock("BridgePiTokenMockV2");
        const bridge = await Bridge.deploy(mockPiToken.address);  
        await bridge.setApiMintPerBlock(1);
        await bridge.addMinter(alice);
        await bridge.mockSetTranschesBlock(1);
        await bridge.mockSetApiReserveFromOldTranchse("30000000");
        await bridge.apiMint(alice, "30000000");
        await expect(mockPiToken.transfer).to.have.callCount(1);
    })

    it("should call community mint, work, old tranche", async()=>{
        const mockPiToken = await smock.fake("PiTokenMockV2");
        await mockPiToken.balanceOf.returns("30000000");
        await mockPiToken.transfer.returns(true);
        const Bridge = await smock.mock("BridgePiTokenMockV2");
        const bridge = await Bridge.deploy(mockPiToken.address);
        await bridge.setCommunityMintPerBlock(1);
        await bridge.addMinter(alice);
        await bridge.mockSetTranschesBlock(1);
        await bridge.mockSetCommunityReserveFromOldTranchse("30000000");
        await bridge.communityMint(alice, "30000000");
        await expect(mockPiToken.transfer).to.have.callCount(1);
    })

    it("should call before change min rate, into if", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(10000000);
        await mockPiToken.mock.transfer.returns(true);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.setBlockNumber(100);
        await bridge.mockSetApiMintPerBlock(1);
        await bridge.mockSetCommunityMintPerBlock(1);
        await bridge.mockSetTranschesBlock(1);
        const oldApiReserve =  await bridge.getApiReserveFromOldTranches();
        const oldCommunityReserve= await bridge.getCommunityReserveFromOldTranches();
        await bridge.mockCallBeforeChangeMinRate();
        const apiReserve =  await bridge.getApiReserveFromOldTranches();
        const communityReserve= await bridge.getCommunityReserveFromOldTranches();
        expect(apiReserve.toNumber()).to.be.greaterThanOrEqual(oldApiReserve.toNumber());
        expect(communityReserve.toNumber()).to.be.greaterThanOrEqual(oldCommunityReserve.toNumber());
    })

    it("should call before change min rate, into if", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(10000000);
        await mockPiToken.mock.transfer.returns(true);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.setBlockNumber(100);
        await bridge.mockSetTranschesBlock(1);
        const blkNumber = await ethers.provider.getBlockNumber();
        await bridge.mockCallUpdateCurrentTranch();
        const trBlk = await bridge.getTranschesBlock();
        expect(trBlk).to.be.equal("100");
    })

    it("should call left to mint for current block, into if", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(10000000);
        await mockPiToken.mock.transfer.returns(true);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.mockSetTranschesBlock(10000);
        await bridge.setBlockNumber(1);
        const res = await bridge.mockCallLeftToMintForCurrentBlock(1);
        expect(res.toString()).to.be.equal("0");
    })

    it("should call left to mint, into if", async()=>{
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        await mockPiToken.mock.balanceOf.returns(0);
        await mockPiToken.mock.transfer.returns(true);
        const bridge = await this.Bridge.deploy(mockPiToken.address);
        await bridge.mockSetTranschesBlock(1);
        const res = await bridge.mockCallLeftToMint(1);
        expect(res.toString()).to.be.equal("0");
    })

    it("check block number, work", async()=>{
        const Bridge = await ethers.getContractFactory("BridgePiTokenMockV3");
        const mockPiToken = await deployMockContract(aliceAccount, MockPiToken.abi);
        const bridge = await Bridge.deploy(mockPiToken.address);
        const blockNumber = await ethers.provider.getBlockNumber();
        const _blockNumber = await bridge.getBlockNumber();
        expect(blockNumber).to.be.equal(_blockNumber);
    })
})