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
chai.use(smock.matchers)

describe("PiToken", ()=>{
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
        this.Archimedes = await ethers.getContractFactory("Archimedes");
        this.PiToken = await smock.mock("PiTokenMockV2");
    })

    it("check initalize", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(1);
        await expect(tk.init()).to.be.revertedWith("Already initialized");
        tk.totalSupply.returns(0);
        await tk.init();
    })

    it("check add mitner", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(MOCK_ADDRESS);
        const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6"
        await expect(tk.hasRole(MINTER_ROLE, MOCK_ADDRESS)).to.not.be.equal(false);
       
    })

    it("call init rewards, fail already set", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.setVariable("tranchesBlock", 1);
        await expect(tk.initRewardsOn(0)).to.be.revertedWith("Already set");
    })

    it("call init rewards, worked", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.setVariable("tranchesBlock", 0);
        await tk.initRewardsOn(1);
        const trBlk = await tk.getTranchesBlock();
        expect(trBlk).to.be.equal("1");
    })



    it("should set comm mint per block, fail same rate", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        const cmpb = await tk.communityMintPerBlock();
        await expect(tk.setCommunityMintPerBlock(cmpb)).to.be.revertedWith("Same rate");
    })

    it("should set comm mint per block worked, go into if", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.setVariable("tranchesBlock", 1);
        await tk.setVariable("apiMintPerBlock", 1);

        await tk.setCommunityMintPerBlock(2);
        const cmpb = await tk.communityMintPerBlock();
        expect(cmpb).to.be.equal("2");
    })

    it("should set comm mint per block worked, not go into if", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.setVariable("tranchesBlock", 1);

        await tk.setCommunityMintPerBlock(2);
        const cmpb = await tk.communityMintPerBlock();
        expect(cmpb).to.be.equal("2");
    })


    it("should set api mint per block, fail same rate", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        const apb = await tk.apiMintPerBlock();
        await expect(tk.setApiMintPerBlock(apb)).to.be.revertedWith("Same rate");
    })
  

    it("should set api mint per block worked, not go into if", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.setVariable("tranchesBlock", 0);

        await tk.setApiMintPerBlock(2);
        const ampb = await tk.apiMintPerBlock();
        expect(ampb).to.be.equal("2");
    })



    it("should mint for multichain, fail, insuficient supply", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        await expect(tk.mintForMultiChain(0,"0x00")).to.be.revertedWith("Insufficient supply")
    })

    it("should mint for multichain, fail, insuficient supply", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        await expect(tk.mintForMultiChain("7000000000000000000000000000000","0x00")).to.be.revertedWith("Cant' mint more than cap")
    })

    it("should mint for multichain, fail", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.mintForMultiChain("700000000","0x00")
        const amfct = await tk.getApiMintedForCurrentTranch();
        const cmfct = await tk.getCommunityMintedForCurrentTranch();
        expect(amfct).to.be.equal("0");
        expect(cmfct).to.be.equal("0");
    })

    it("should call community mint, fail, only minters", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await expect(tk.connect(bobAccount).communityMint(alice,0)).to.be.revertedWith("Only minters")
    })

    it("should call community mint, fail, can not mint to zero address", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);
        await expect(tk.communityMint(ZERO_ADDRESS,0)).to.be.revertedWith("Can't mint to zero address");
    })

    it("should call community mint, fail, insuficient supply", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        await expect(tk.communityMint(alice,0)).to.be.revertedWith("Insufficient supply");
    })

    it("should call community mint, fail, rewards not initalized", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',0)
        await expect(tk.communityMint(alice,1)).to.be.revertedWith("Rewards not initialized");
    })

    it("should call community mint, fail, stll waiting for rewards block", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',"10000000000000000000000")
        await expect(tk.communityMint(alice,1)).to.be.revertedWith("Still waiting for rewards block");
    })


    it("should call community mint, fail, mint capped", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',"1")
        await expect(tk.communityMint(alice,"7000000000000000000000000000000")).to.be.revertedWith("Mint capped to 62.8M");
    })

    it("should call community mint, fail, mint ratio is 0", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',"1")
        tk.setVariable('communityMintPerBlock', 0);
        await expect(tk.communityMint(alice,"1")).to.be.revertedWith("Mint ratio is 0");
    })

    it("should call community mint, works, to mint smaller then max mintable", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',"1")
        tk.setVariable('communityMintPerBlock', 1);
        await tk.communityMint(alice,"1");
        expect(tk.transfer).to.have.callCount(1);
    })

    it("should call community mint, fail, to mint bigger then max mintable, can't mint more then expected", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',"1")
        tk.setVariable('communityMintPerBlock', 1);
        await expect(tk.communityMint(alice,"3000000000")).to.be.revertedWith("Can't mint more than expected");
    })

    it("should call community mint, works, to mint bigger then max mintable", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',"1")
        tk.setVariable('communityMintPerBlock', 1);
        tk.setVariable("communityReserveFromOldTranches","1000000000000000000000000000000");
        await tk.communityMint(alice,"3000000000");
        expect(tk.transfer).to.have.callCount(1);

    })




    it("should call api mint, fail, to mint bigger then max mintable, can't mint more then expected", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',"1")
        tk.setVariable('apiMintPerBlock', 1);
        await expect(tk.apiMint(alice,"3000000000")).to.be.revertedWith("Can't mint more than expected");
    })

    it("should call api mint, works, to mint bigger then max mintable", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',"1")
        tk.setVariable('apiMintPerBlock', 1);
        tk.setVariable("apiReserveFromOldTranches","1000000000000000000000000000000");
        await tk.apiMint(alice,"3000000000");
        expect(tk.transfer).to.have.callCount(1);

    })

    it("should call api mint, works, to mint smaller then max mintable", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',"1")
        tk.setVariable('apiMintPerBlock', 1);
        await tk.apiMint(alice,"1");
        expect(tk.transfer).to.have.callCount(1);
    })


    it("should call community left to mint, works, to mint bigger then max mintable", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',"1")
        tk.setVariable('apiMintPerBlock', 1);
        tk.setVariable("communityReserveFromOldTranches","1000000000000000000000000000000");
        const r = await tk.communityLeftToMint();
        expect(r).to.be.above(0);
    })

    it("should call community left to mint, total left 0", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',"1")
        tk.setVariable('apiMintPerBlock', 1);
        tk.setVariable("communityReserveFromOldTranches","1000000000000000000000000000000");
        const msply = await tk.MAX_SUPPLY();
        tk.totalSupply.returns(msply);
        const r = await tk.communityLeftToMint();
        expect(r.toString()).to.be.equal("0");    
    })

    it("should call community left to mint, tranches block 0", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',"0")
        tk.setVariable('apiMintPerBlock', 1);
        tk.setVariable("communityReserveFromOldTranches","1000000000000000000000000000000");
        const r = await tk.communityLeftToMint();
        expect(r).to.be.above(0);
    })



    it("should call api left to mint, works, to mint bigger then max mintable", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.transfer.returns(true);
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addMinter(alice);

        tk.setVariable('tranchesBlock',"1")
        tk.setVariable('apiMintPerBlock', 1);
        tk.setVariable("apiReserveFromOldTranches","1000000000000000000000000000000");
        const r = await tk.apiLeftToMint();
        expect(r).to.be.above(0);
    })


    it("should call tokens received, fail invalid token", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        await expect(tk.tokensReceived(ZERO_ADDRESS,ZERO_ADDRESS,ZERO_ADDRESS, 0, "0x00", "0x00")).to.be.revertedWith("Invalid token")
    })

    it("should check add burne and burn", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        await tk.addBurner(alice);
    })

    it("should check cap", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        const cap = await tk.cap();
        const msply = await tk.MAX_SUPPLY();
        expect(cap).to.be.equal(msply);
    })


    it("check block number, work", async()=>{
        const tk = await this.PiToken.deploy("Ss", "ss");
        tk.totalSupply.returns(0);
        await tk.init();
        const blockNumber = await ethers.provider.getBlockNumber();
        const _blockNumber = await tk.getBlockNumber();
        expect(blockNumber).to.be.equal(_blockNumber);
    })

})