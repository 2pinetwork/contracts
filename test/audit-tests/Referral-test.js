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

describe("Referral", ()=>{
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
        this.Referral = await smock.mock("Referral");
    })

    it("deploy fail archimedes zero address", async()=>{
        await expect(this.Referral.deploy(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress for Archimedes")
    })

    it("should call recordRefferal, not go into if" ,async()=>{
        const arch = await smock.fake(this.Archimedes);
        const ref = await this.Referral.deploy(arch.address);
        await aliceAccount.sendTransaction({
            to: arch.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await expect(ref.connect(arch.wallet).recordReferral(ZERO_ADDRESS, MOCK_ADDRESS)).to.not.emit(ref, "ReferralRecorded");
    })

    it("should call recordRefferal, go into if" ,async()=>{
        const arch = await smock.fake(this.Archimedes);
        const ref = await this.Referral.deploy(arch.address);
        await aliceAccount.sendTransaction({
            to: arch.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await expect(ref.connect(arch.wallet).recordReferral(MOCK_ADDRESS, MOCK_ADDRESSV2)).to.emit(ref, "ReferralRecorded");
    })

    it("should call recordRefferal, fail not archimedes" ,async()=>{
        const arch = await smock.fake(this.Archimedes);
        const ref = await this.Referral.deploy(arch.address);
        await expect(ref.recordReferral(MOCK_ADDRESS, MOCK_ADDRESSV2)).to.be.revertedWith("!Archimedes");
    })

    it("should call refferal paid", async()=>{
        const arch = await smock.fake(this.Archimedes);
        const ref = await this.Referral.deploy(arch.address);
        await aliceAccount.sendTransaction({
            to: arch.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await expect(ref.connect(arch.wallet).referralPaid(MOCK_ADDRESS, 1)).to.emit(ref, "ReferralPaid");
    })

    it("should check get refferal", async()=>{
        const arch = await smock.fake(this.Archimedes);
        const ref = await this.Referral.deploy(arch.address);
        await aliceAccount.sendTransaction({
            to: arch.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await expect(ref.connect(arch.wallet).recordReferral(MOCK_ADDRESS, MOCK_ADDRESSV2)).to.emit(ref, "ReferralRecorded");
        const referrer = await ref.getReferrer(MOCK_ADDRESS);
        expect(referrer).to.be.equal(MOCK_ADDRESSV2)
    })
})