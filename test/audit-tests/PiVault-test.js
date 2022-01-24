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


describe("PiVault", ()=>{
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
        this.PiVault = await smock.mock("PiVaultMock");
    })

    it("should add investor, check", async()=>{
        const mockToken = await smock.fake(this.Token);
        const vault = await this.PiVault.deploy(mockToken.address, 0 , 0);
        await vault.addInvestor(MOCK_ADDRESS);
        const invs = await vault.investors(MOCK_ADDRESS);
        expect(invs).to.be.equal(true);
    })

    it("should add founder, check", async()=>{
        const mockToken = await smock.fake(this.Token);
        const vault = await this.PiVault.deploy(mockToken.address, 0 , 0);
        await vault.addFounder(MOCK_ADDRESS);
        const invs = await vault.founders(MOCK_ADDRESS);
        expect(invs).to.be.equal(true);
    })

    it("should call deposit all", async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1000000000000000000")
        await mockToken.transferFrom.returns(true);
        const vault = await this.PiVault.deploy(mockToken.address, 0 , 0);
        await expect(vault.depositAll()).to.emit(vault, "Deposit");
    })

    it("should call deposit all", async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1000000000000000000")
        await mockToken.transferFrom.returns(true);
        const vault = await this.PiVault.deploy(mockToken.address, 0 , 0);
        await vault.setVariable("_totalSupply", 1);
        await expect(vault.depositAll()).to.emit(vault, "Deposit");
    })


    it("should call withdraw all, works,  go into check withdraw but don't trigger any ifs", async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1000000000000000000")
        await mockToken.transfer.returns(true);
        const vault = await this.PiVault.deploy(mockToken.address, 0 , 0);
        await vault.setVariable("_totalSupply", 1);
        await expect(vault.withdrawAll()).to.emit(vault, "Withdraw");
    })

    it("should call withdraw all, investor still locked", async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1000000000000000000")
        await mockToken.transfer.returns(true);
        const block = await ethers.provider.getBlock('latest')

        const vault = await this.PiVault.deploy(mockToken.address, block.timestamp+600 , block.timestamp+600);
        await vault.setVariable("_totalSupply", 1);
        await vault.addInvestor(alice);        
        await expect(vault.withdrawAll()).to.be.revertedWith("Still locked");
    })

    it("should call withdraw all, investor not locked", async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1000000000000000000")
        await mockToken.transfer.returns(true);
        const block = await ethers.provider.getBlock('latest')

        const vault = await this.PiVault.deploy(mockToken.address, 0 , block.timestamp+600);
        await vault.setVariable("_totalSupply", 1);
        await vault.addInvestor(alice);        
        await expect(vault.withdrawAll()).to.emit(vault, "Withdraw");
    })

    it("should call withdraw all, founder still locked", async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1000000000000000000")
        await mockToken.transfer.returns(true);
        const block = await ethers.provider.getBlock('latest')

        const vault = await this.PiVault.deploy(mockToken.address, block.timestamp+600 , block.timestamp+600);
        await vault.setVariable("_totalSupply", 1);
        await vault.addFounder(alice);        
        await expect(vault.withdrawAll()).to.be.revertedWith("Still locked");
    })

    it("should call withdraw all, founder not locked, max withdraw not reached", async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1000000000000000000")
        await mockToken.transfer.returns(true);
        const block = await ethers.provider.getBlock('latest')

        const vault = await this.PiVault.deploy(mockToken.address, block.timestamp-600 , block.timestamp-600);
        await vault.setVariable("_totalSupply", 1);
        await vault.addFounder(alice);        
        await expect(vault.withdrawAll()).to.emit(vault, "Withdraw");
    })

    it("should call withdraw, amount not available", async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1000000000000000000000000000000")
        await mockToken.transfer.returns(true);
        const block = await ethers.provider.getBlock('latest')

        const vault = await this.PiVault.deploy(mockToken.address, block.timestamp-600 , block.timestamp+600);
        await vault.setVariable("_totalSupply", 1);
        await vault.addFounder(alice);        
        await expect(vault.withdraw("1")).to.be.revertedWith("Amount not available");
    })

    it("should call withdraw, hit max withdraw", async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1000000000000000000000000000000")
        await mockToken.transfer.returns(true);
        const block = await ethers.provider.getBlock('latest')

        const vault = await this.PiVault.deploy(mockToken.address, block.timestamp-600 , block.timestamp+600);
        await vault.setVariable("_totalSupply", 1);
        await vault.setVariable("_balances", {
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266": "1000000000000000000000000000000"
        });
        await vault.addFounder(alice);        
        await expect(vault.withdraw("1")).to.be.revertedWith("Max withdraw reached");
    })


    it("should call withdraw, not hit max withdraw", async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1")
        await mockToken.transfer.returns(true);
        const block = await ethers.provider.getBlock('latest')

        const vault = await this.PiVault.deploy(mockToken.address, block.timestamp-600 , block.timestamp+600);
        await vault.setVariable("_totalSupply", 1);
        await vault.setVariable("_balances", {
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266": "1"
        });
        await vault.addFounder(alice);        
        await expect(vault.withdraw("1")).to.emit(vault,"Withdraw");
    })


    it("should call get price per full share",async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1")
        await mockToken.transfer.returns(true);

        const vault = await this.PiVault.deploy(mockToken.address, 0 , 0);
        await vault.setVariable("_totalSupply",1);
        let price = await vault.getPricePerFullShare();
        expect(price.toString()).to.be.equal("1000000000000000000");
    })


    it("should call before token transfer, go into if, investors true, still locked",async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1")
        await mockToken.transfer.returns(true);
        const block = await ethers.provider.getBlock("latest");
        const vault = await this.PiVault.deploy(mockToken.address, block.timestamp+600 , 0);
        await vault.setVariable("_totalSupply",1);
        await vault.addInvestor(MOCK_ADDRESS);
        await expect(vault.mockCallBeforeTokenTransfer(MOCK_ADDRESS, MOCK_ADDRESSV2)).to.be.revertedWith("Still locked");
    })

    it("should call before token transfer, go into if, investors true, not locked",async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1")
        await mockToken.transfer.returns(true);
        const block = await ethers.provider.getBlock("latest");
        const vault = await this.PiVault.deploy(mockToken.address, 0, 0);
        await vault.setVariable("_totalSupply",1);
        await vault.addInvestor(MOCK_ADDRESS);
        await expect(vault.mockCallBeforeTokenTransfer(MOCK_ADDRESS, MOCK_ADDRESSV2)).to.not.be.revertedWith("Still locked");
    })

    it("should call before token transfer, go into if, investors false, founder true, still locked",async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1")
        await mockToken.transfer.returns(true);
        const block = await ethers.provider.getBlock("latest");
        const vault = await this.PiVault.deploy(mockToken.address, 0, block.timestamp+600);
        await vault.setVariable("_totalSupply",1);
        await vault.addFounder(MOCK_ADDRESS);
        await expect(vault.mockCallBeforeTokenTransfer(MOCK_ADDRESS, MOCK_ADDRESSV2)).to.be.revertedWith("Still locked");
    })

    it("should call before token transfer, go into if, investors false, founder true, not locked",async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1")
        await mockToken.transfer.returns(true);
        const block = await ethers.provider.getBlock("latest");
        const vault = await this.PiVault.deploy(mockToken.address, 0, 0);
        await vault.setVariable("_totalSupply",1);
        await vault.addFounder(MOCK_ADDRESS);
        await expect(vault.mockCallBeforeTokenTransfer(MOCK_ADDRESS, MOCK_ADDRESSV2)).to.not.be.revertedWith("Still locked");
    })

    it("should call before token transfer, go into if, investors false, founder false",async()=>{
        const mockToken = await smock.fake(this.Token);
        await mockToken.balanceOf.returns("1")
        await mockToken.transfer.returns(true);
        const block = await ethers.provider.getBlock("latest");
        const vault = await this.PiVault.deploy(mockToken.address, 0, 0);
        await vault.setVariable("_totalSupply",1);
        await expect(vault.mockCallBeforeTokenTransfer(MOCK_ADDRESS, MOCK_ADDRESSV2)).to.not.be.revertedWith("Still locked");
    })
})