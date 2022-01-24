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


describe("ControllerCurveStrat", async()=>{


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
        this.UniswapRouter = await ethers.getContractFactory("UniswapRouterMock");
        this.CurvePool = await ethers.getContractFactory("CurvePoolMock");
        this.RewardsGauge = await ethers.getContractFactory("CurveRewardsGaugeMock");
        this.Controller = await ethers.getContractFactory("Controller");
        this.Token = await ethers.getContractFactory("TokenMock");
        this.ControllerCurveStrat = await ethers.getContractFactory("ControllerCurveStrat");
        this.ControllerCurveStratMock = await smock.mock("ControllerCurveStrat")
    })

    it("should deploy fail with zero addresses", async()=>{
        await expect(this.ControllerCurveStrat.deploy(ZERO_ADDRESS,ZERO_ADDRESS,ZERO_ADDRESS)).to.be.revertedWith("Controller !ZeroAddress");
        await expect(this.ControllerCurveStrat.deploy(MOCK_ADDRESS,ZERO_ADDRESS, ZERO_ADDRESS)).to.be.revertedWith("Exchange !ZeroAddress");
        await expect(this.ControllerCurveStrat.deploy(MOCK_ADDRESS, MOCK_ADDRESS,ZERO_ADDRESS)).to.be.revertedWith("Treasury !ZeroAddress");
    })

    it("should deploy works", async()=>{
        const ctrl = await this.ControllerCurveStrat.deploy(MOCK_ADDRESS, MOCK_ADDRESS,MOCK_ADDRESS);
        const _controller = await ctrl.controller();
        const _exchange = await ctrl.exchange()
        const _treasury = await ctrl.treasury();
        expect(_controller).to.be.equal(MOCK_ADDRESS);
        expect(_exchange).to.be.equal(MOCK_ADDRESS);
        expect(_treasury).to.be.equal(MOCK_ADDRESS);
    })

    it("should call set treasury fail same address", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrl.setTreasury(MOCK_ADDRESS)).to.be.revertedWith("Same address");
    })


    it("should call set treasury fail zero address", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrl.setTreasury(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress");
    })

    it("should call set treasury, work", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrl.setTreasury(MOCK_ADDRESSV2)).to.emit(ctrl, "NewTreasury").withArgs(MOCK_ADDRESS, MOCK_ADDRESSV2);
        const trs = await ctrl.treasury();
        expect(trs).to.be.equal(MOCK_ADDRESSV2);
    })


    it("should call set exchange fail same address", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrl.setExchange(MOCK_ADDRESS)).to.be.revertedWith("Same address");
    })


    it("should call set exchange fail zero address", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrl.setExchange(ZERO_ADDRESS)).to.be.revertedWith("!ZeroAddress");
    })

    it("should call set exchange, work", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrl.setExchange(MOCK_ADDRESSV2)).to.emit(ctrl, "NewExchange").withArgs(MOCK_ADDRESS, MOCK_ADDRESSV2);
        const trs = await ctrl.exchange();
        expect(trs).to.be.equal(MOCK_ADDRESSV2);
    })


    it("should call set wnative swap route fail same address", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const wn = await ctrl.WNATIVE();

        await expect(ctrl.setWNativeSwapRoute([MOCK_ADDRESS, wn])).to.be.revertedWith("First route isn't wNative");
    })


    it("should call set wnative swap route fail zero address", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const wn = await ctrl.WNATIVE();
        const btc = await ctrl.BTC();
        await expect(ctrl.setWNativeSwapRoute([wn, btc, MOCK_ADDRESS])).to.be.revertedWith("Last route isn't BTC");
    })

    it("should call set wnative swap route, work", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const wn = await ctrl.WNATIVE();
        const btc = await ctrl.BTC();
        await ctrl.setWNativeSwapRoute([wn,btc]);
        const route_1 = await ctrl.wNativeToBtcRoute(0);
        const route_2 = await ctrl.wNativeToBtcRoute(1);

        expect(route_1).to.be.equal(wn);
        expect(route_2).to.be.equal(btc);
    })


    it("should call set crv swap route fail same address", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const crv = await ctrl.CRV();

        await expect(ctrl.setCrvSwapRoute([MOCK_ADDRESS, crv])).to.be.revertedWith("First route isn't CRV");
    })


    it("should call set crv swap route fail zero address", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const crv = await ctrl.CRV();
        const btc = await ctrl.BTC();
        await expect(ctrl.setCrvSwapRoute([crv, btc, MOCK_ADDRESS])).to.be.revertedWith("Last route isn't BTC");
    })

    it("should call set crv swap route, work", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const crv = await ctrl.CRV();
        const btc = await ctrl.BTC();
        await ctrl.setCrvSwapRoute([crv,btc]);
        const route_1 = await ctrl.crvToBtcRoute(0);
        const route_2 = await ctrl.crvToBtcRoute(1);

        expect(route_1).to.be.equal(crv);
        expect(route_2).to.be.equal(btc);
    })


    it("should call set performance fee fail same address", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const pf  = await ctrl.performanceFee();
        await expect(ctrl.setPerformanceFee(pf)).to.be.revertedWith("Same fee");
    })


    it("should call set performance fee fail zero address", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrl.setPerformanceFee(100001)).to.be.revertedWith("Can't be greater than max");
    })

    it("should call set performance feex, work", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const pf  = await ctrl.performanceFee();
        await expect(ctrl.setPerformanceFee(499)).to.emit(ctrl, "NewPerformanceFee").withArgs(pf, "499");
        const newPf = await ctrl.performanceFee();
        expect(newPf).to.not.be.equal(pf);
        expect(newPf.toString()).to.be.equal("499");
    })



    it("should call set setPoolMinVirtualPrice  fail same ratio", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const pf  = await ctrl.poolMinVirtualPrice();
        await expect(ctrl.setPoolMinVirtualPrice(pf)).to.be.revertedWith("Same ratio");
    })


    it("should call set setPoolMinVirtualPrice  fail can not be more then 100%", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrl.setPoolMinVirtualPrice(100001)).to.be.revertedWith("Can't be more than 100%");
    })

    it("should call set setPoolMinVirtualPrice feex, work", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const pf  = await ctrl.poolMinVirtualPrice();
        await ctrl.setPoolMinVirtualPrice(499);
        const newPf = await ctrl.poolMinVirtualPrice();
        expect(newPf).to.not.be.equal(pf);
        expect(newPf.toString()).to.be.equal("499");
    })



    it("should call set setPoolSlippageRatio  fail same ratio", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const pf  = await ctrl.poolSlippageRatio();
        await expect(ctrl.setPoolSlippageRatio(pf)).to.be.revertedWith("Same ratio");
    })


    it("should call set setPoolSlippageRatio  fail can not be more then 100%", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrl.setPoolSlippageRatio(100001)).to.be.revertedWith("Can't be more than 100%");
    })

    it("should call set setPoolSlippageRatio feex, work", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const pf  = await ctrl.poolSlippageRatio();
        await ctrl.setPoolSlippageRatio(499);
        const newPf = await ctrl.poolSlippageRatio();
        expect(newPf).to.not.be.equal(pf);
        expect(newPf.toString()).to.be.equal("499");
    })


    it("should call set setRatioForFullWithdraw  fail same ratio", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const pf  = await ctrl.ratioForFullWithdraw();
        await expect(ctrl.setRatioForFullWithdraw(pf)).to.be.revertedWith("Same ratio");
    })


    it("should call set setRatioForFullWithdraw  fail can not be more then 100%", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrl.setRatioForFullWithdraw(100001)).to.be.revertedWith("Can't be more than 100%");
    })

    it("should call set setRatioForFullWithdraw feex, work", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        const pf  = await ctrl.ratioForFullWithdraw();
        await ctrl.setRatioForFullWithdraw(499);
        const newPf = await ctrl.ratioForFullWithdraw();
        expect(newPf).to.not.be.equal(pf);
        expect(newPf.toString()).to.be.equal("499");
    })


    it("should call before movement, current balance lower then last balance" ,async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returns(1);


        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})

        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 1000);
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await ctrl.connect(mockController.wallet).beforeMovement();
        expect(btcMock.balanceOf).to.have.callCount(1);
    })

    it("should call before movement, current balance higher then last balance, perf fee 0" ,async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returns(1);


        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})

        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await ctrl.connect(mockController.wallet).beforeMovement();
        expect(btcMock.balanceOf).to.have.callCount(1);

        
    })


    it("should call before movement, current balance higher then last balance, perf fee  bigger then 0, go into last if" ,async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,1);
        await btcMock.balanceOf.returnsAtCall(1,2);
        await btcMock.balanceOf.returnsAtCall(2,2);
        await btcMock.transfer.returns(true);


        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})

        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 10000)
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await ctrl.connect(mockController.wallet).beforeMovement();
        expect(btcMock.balanceOf).to.have.callCount(3);
        
    })

    it("should call before movement, current balance higher then last balance, perf fee  bigger then 0, go into second if" ,async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,1);
        await btcMock.balanceOf.returnsAtCall(1,2);
        await btcMock.balanceOf.returnsAtCall(2,0);
        await btcMock.transfer.returns(true);


        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})

        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 10000)
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await ctrl.connect(mockController.wallet).beforeMovement();
        expect(btcMock.balanceOf).to.have.callCount(3);
        
    })

    it("should call before movement, current balance higher then last balance, perf fee  bigger then 0, go into first if, fail remove liq exp 0" ,async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,1);
        await btcMock.balanceOf.returnsAtCall(1,0);
        await btcMock.balanceOf.returnsAtCall(2,0);
        await btcMock.transfer.returns(true);


        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})

        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 10000)
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await expect(ctrl.connect(mockController.wallet).beforeMovement()).to.be.revertedWith("remove_liquidity expected = 0");
        
    })
    


    it("should call before movement, current balance higher then last balance, perf fee  bigger then 0, go into first if, don't trigge require" ,async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,"10000000000000000000000");
        await btcMock.balanceOf.returnsAtCall(1,0);
        await btcMock.balanceOf.returnsAtCall(2,0);
        await btcMock.transfer.returns(true);

        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})
        await curve.calc_withdraw_one_coin.returns();

        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 1000000)
        await ctrl.setVariable("poolSlippageRatio", 0);


        const btcCrvMock = await smock.fake(this.Token, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"});
        await btcCrvMock.balanceOf.returns("100000000000000000000000000000000000000");

        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await ctrl.connect(mockController.wallet).beforeMovement();
        expect(btcMock.balanceOf).to.have.callCount(3);
        
    })


    it("should call deposit, btc and btccrv balance both 0", async()=>{
        const mockController = await smock.fake(this.Controller);
        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,0);


        const btcCrvMock = await smock.fake(this.Token, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"});
        await btcCrvMock.balanceOf.returns(0);

        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);

        
        
        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);


        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await ctrl.connect(mockController.wallet).deposit();
        expect(btcMock.balanceOf).to.have.callCount(2);
        
    })

    it("should call deposit, btc balance bigger 0", async()=>{
        const mockController = await smock.fake(this.Controller);
        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,1);
        await btcMock.approve.returns(true);

        const btcCrvMock = await smock.fake(this.Token, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"});
        await btcCrvMock.balanceOf.returns(0);
        await btcCrvMock.approve.returns(true);


        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);
        
        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);

        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})
        await curve.add_liquidity.returns();

        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await ctrl.connect(mockController.wallet).deposit();
        expect(btcMock.balanceOf).to.have.callCount(2);

        
    })

    it("should call deposit, btccrv balance bigger then 0", async()=>{
        const mockController = await smock.fake(this.Controller);
        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,0);
        await btcMock.approve.returns(true);


        const btcCrvMock = await smock.fake(this.Token, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"});
        await btcCrvMock.balanceOf.returns(1);
        await btcCrvMock.approve.returns(true);

        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);
        
        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);


        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await ctrl.connect(mockController.wallet).deposit();
        expect(btcMock.balanceOf).to.have.callCount(2);
    })


    it("should call withdraw, balance bigger then amount" ,async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,"10000000000000000000000");
        await btcMock.balanceOf.returnsAtCall(1,0);
        await btcMock.balanceOf.returnsAtCall(2,0);
        await btcMock.transfer.returns(true);

        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})
        await curve.calc_withdraw_one_coin.returns();

        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 1000000)
        await ctrl.setVariable("poolSlippageRatio", 0);


        const btcCrvMock = await smock.fake(this.Token, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"});
        await btcCrvMock.balanceOf.returns("100000000000000000000000000000000000000");
        await btcCrvMock.approve.returns(true);

        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await ctrl.connect(mockController.wallet).withdraw(1);
        expect(btcMock.transfer).to.have.callCount(1);
        
    })

    it("should call withdraw, balance lower then amount, go in first if" ,async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,"10000000000000000000000");
        await btcMock.balanceOf.returnsAtCall(1,0);
        await btcMock.balanceOf.returnsAtCall(2,0);
        await btcMock.transfer.returns(true);

        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})
        await curve.calc_withdraw_one_coin.returns();

        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 1000000)
        await ctrl.setVariable("poolSlippageRatio", 0);


        const btcCrvMock = await smock.fake(this.Token, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"});
        await btcCrvMock.balanceOf.returns("100000000000000000000000000000000000000");
        await btcCrvMock.approve.returns(true);

        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await ctrl.connect(mockController.wallet).withdraw("100000000000000000000000");
        expect(btcMock.transfer).to.have.callCount(1);

        
    })

    it("should call withdraw, balance lower then amount, go in first else, require liqudity hit" ,async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,"0");
        await btcMock.balanceOf.returnsAtCall(1,0);
        await btcMock.balanceOf.returnsAtCall(2,0);
        await btcMock.transfer.returns(true);

        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})
        await curve.calc_withdraw_one_coin.returns("100000000000000000000000000000000000000000");

        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns("100000000000000000000000000000000000000000");


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 1000000)
        await ctrl.setVariable("poolSlippageRatio", 0);

        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await expect(ctrl.connect(mockController.wallet).withdraw("1")).to.be.revertedWith("remove_liquidity expected = 0");
        
    })



    it("should call withdraw, balance smaller then amount, dodge last if" ,async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,"10000000000000000000000");
        await btcMock.balanceOf.returnsAtCall(1,"1000000000000000000000000");


        await btcMock.transfer.returns(true);
        await btcMock.approve.returns(true);


        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})
        await curve.calc_withdraw_one_coin.returns();

        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 1000000)
        await ctrl.setVariable("poolSlippageRatio", 0);


        const btcCrvMock = await smock.fake(this.Token, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"});
        await btcCrvMock.balanceOf.returns("100000000000000000000000000000000000000");
        await btcCrvMock.approve.returns(true);

        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await ctrl.connect(mockController.wallet).withdraw("100000000000000000000000");
        expect(btcMock.transfer).to.have.callCount(1);
        
    })



    it("should call harvest, work simple", async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,"10000000000000000000000");
        await btcMock.balanceOf.returns("1000000000000000000000000");
        await btcMock.transfer.returns(true);
        await btcMock.approve.returns(true);

        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})
        await curve.calc_withdraw_one_coin.returns();


        const wn = await smock.fake(this.Token, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await wn.balanceOf.returns(0);


        const crv = await smock.fake(this.Token, {address: "0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E"});
        await crv.balanceOf.returns(0);


        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 1000000)
        await ctrl.setVariable("poolSlippageRatio", 0);


        const btcCrvMock = await smock.fake(this.Token, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"});
        await btcCrvMock.balanceOf.returns("100000000000000000000000000000000000000");
        await btcCrvMock.approve.returns(true);

        await expect(ctrl.harvest()).to.emit(ctrl, "Harvested");
                                                                                           
    })


    it("should call harvest, wnative greater then 0, crv greater then 0", async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,"10000000000000000000000");
        await btcMock.balanceOf.returns("1000000000000000000000000");
        await btcMock.transfer.returns(true);
        await btcMock.approve.returns(true);

        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})
        await curve.calc_withdraw_one_coin.returns();


        const wn = await smock.fake(this.Token, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await wn.balanceOf.returns("1000000000000000000000000");
        await wn.approve.returns(true);


        const crv = await smock.fake(this.Token, {address: "0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E"});
        await crv.balanceOf.returns("1000000000000000000000000");
        await crv.approve.returns(true);


        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 1000000)
        await ctrl.setVariable("poolSlippageRatio", 0);


        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])


        const PriceFeedMock = await ethers.getContractFactory("PriceFeedMock");
        const priceFeedMock= await smock.fake(PriceFeedMock);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await ctrl.setVariable("oracles", {
            "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f": priceFeedMock.address,
        })


        await ctrl.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        await ctrl.setVariable("oracles", {
            "0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E" : priceFeedMock.address,
        })

        await ctrl.setVariable("exchange", uniswapRouterMock.address);


        const btcCrvMock = await smock.fake(this.Token, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"});
        await btcCrvMock.balanceOf.returns("100000000000000000000000000000000000000");
        await btcCrvMock.approve.returns(true);

        await expect(ctrl.harvest()).to.emit(ctrl, "Harvested");
                                                                                           
    })


    it("should call retire strat to harvest, with paused, wnative greater then 0, crv greater then 0", async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,"10000000000000000000000");
        await btcMock.balanceOf.returns("1000000000000000000000000");
        await btcMock.transfer.returns(true);
        await btcMock.approve.returns(true);

        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})
        await curve.calc_withdraw_one_coin.returns();


        const wn = await smock.fake(this.Token, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await wn.balanceOf.returns("1000000000000000000000000");
        await wn.approve.returns(true);


        const crv = await smock.fake(this.Token, {address: "0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E"});
        await crv.balanceOf.returns("1000000000000000000000000");
        await crv.approve.returns(true);


        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 1000000)
        await ctrl.setVariable("poolSlippageRatio", 0);


        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])


        const PriceFeedMock = await ethers.getContractFactory("PriceFeedMock");
        const priceFeedMock= await smock.fake(PriceFeedMock);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await ctrl.setVariable("oracles", {
            "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f": priceFeedMock.address,
        })


        await ctrl.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        await ctrl.setVariable("oracles", {
            "0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E" : priceFeedMock.address,
        })

        await ctrl.setVariable("exchange", uniswapRouterMock.address);


        const btcCrvMock = await smock.fake(this.Token, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"});
        await btcCrvMock.balanceOf.returns("100000000000000000000000000000000000000");
        await btcCrvMock.approve.returns(true);
        await ctrl.pause();
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await expect(ctrl.connect(mockController.wallet).retireStrat()).to.emit(ctrl, "Harvested");
                                                                                           
    })


    it("should call retire strat to harvest, without paused, wnative greater then 0, crv greater then 0", async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,"10000000000000000000000");
        await btcMock.balanceOf.returns("1000000000000000000000000");
        await btcMock.transfer.returns(true);
        await btcMock.approve.returns(true);

        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})
        await curve.calc_withdraw_one_coin.returns();


        const wn = await smock.fake(this.Token, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await wn.balanceOf.returns("1000000000000000000000000");
        await wn.approve.returns(true);


        const crv = await smock.fake(this.Token, {address: "0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E"});
        await crv.balanceOf.returns("1000000000000000000000000");
        await crv.approve.returns(true);


        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 1000000)
        await ctrl.setVariable("poolSlippageRatio", 0);


        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])


        const PriceFeedMock = await ethers.getContractFactory("PriceFeedMock");
        const priceFeedMock= await smock.fake(PriceFeedMock);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await ctrl.setVariable("oracles", {
            "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f": priceFeedMock.address,
        })


        await ctrl.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        await ctrl.setVariable("oracles", {
            "0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E" : priceFeedMock.address,
        })

        await ctrl.setVariable("exchange", uniswapRouterMock.address);

        await ctrl.pause();
        await ctrl.unpause();
        const btcCrvMock = await smock.fake(this.Token, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"});
        await btcCrvMock.balanceOf.returns("100000000000000000000000000000000000000");
        await btcCrvMock.approve.returns(true);
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await expect(ctrl.connect(mockController.wallet).retireStrat()).to.emit(ctrl, "Harvested");
                                                                                           
    })




    it("should call panic, wnative greater then 0, crv greater then 0", async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,"10000000000000000000000");
        await btcMock.balanceOf.returns("1000000000000000000000000");
        await btcMock.transfer.returns(true);
        await btcMock.approve.returns(true);

        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})
        await curve.calc_withdraw_one_coin.returns();


        const wn = await smock.fake(this.Token, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await wn.balanceOf.returns("1000000000000000000000000");
        await wn.approve.returns(true);


        const crv = await smock.fake(this.Token, {address: "0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E"});
        await crv.balanceOf.returns("1000000000000000000000000");
        await crv.approve.returns(true);


        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 1000000)
        await ctrl.setVariable("poolSlippageRatio", 0);


        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])


        const PriceFeedMock = await ethers.getContractFactory("PriceFeedMock");
        const priceFeedMock= await smock.fake(PriceFeedMock);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await ctrl.setVariable("oracles", {
            "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f": priceFeedMock.address,
        })


        await ctrl.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        await ctrl.setVariable("oracles", {
            "0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E" : priceFeedMock.address,
        })

        await ctrl.setVariable("exchange", uniswapRouterMock.address);


        const btcCrvMock = await smock.fake(this.Token, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"});
        await btcCrvMock.balanceOf.returns("100000000000000000000000000000000000000");
        await btcCrvMock.approve.returns(true);
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await ctrl.panic();
        expect(rewardsg.withdraw).to.have.callCount(1);
                                                                                           
    })


    it("should call charge fees internal function, go into if", async()=>{

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.transfer.returns(true);

        const controllerCurveStratMock = await smock.mock("ControllerCurveStratMockV2")

        const ctrl = await controllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("performanceFee", 10000);
        await ctrl.mockCallChargeFees(1);
        expect(btcMock.transfer).to.have.callCount(1);

    })

    it("should call charge fees internal function, not go into if", async()=>{
        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.transfer.returns(true);    
        const controllerCurveStratMock = await smock.mock("ControllerCurveStratMockV2")
        const ctrl = await controllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("performanceFee", 0);
        await ctrl.mockCallChargeFees(1);
        expect(btcMock.transfer).to.have.callCount(0);
    })




    it("should call retire strat to harvest, without paused, wnative greater then 0, crv greater then 0, expected equal 0", async()=>{
        const mockController = await smock.fake(this.Controller);

        const btcMock = await smock.fake(this.Token, {address: "0x6d925938Edb8A16B3035A4cF34FAA090f490202a"});
        await btcMock.balanceOf.returnsAtCall(0,"10000000000000000000000");
        await btcMock.balanceOf.returns("1000000000000000000000000");
        await btcMock.transfer.returns(true);
        await btcMock.approve.returns(true);

        const curve = await smock.fake(this.CurvePool, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"})
        await curve.calc_withdraw_one_coin.returns();


        const wn = await smock.fake(this.Token, {address: "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f"});
        await wn.balanceOf.returns("1000000000000000000000000");
        await wn.approve.returns(true);


        const crv = await smock.fake(this.Token, {address: "0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E"});
        await crv.balanceOf.returns("1000000000000000000000000");
        await crv.approve.returns(true);


        const rewardsg = await smock.fake(this.RewardsGauge, {address: "0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8"})
        await rewardsg.balanceOf.returns(0);


        const ctrl = await this.ControllerCurveStratMock.deploy(mockController.address, MOCK_ADDRESS, MOCK_ADDRESS);
        await ctrl.setVariable("lastBalance", 0);
        await ctrl.setVariable("performanceFee", 1000000)
        await ctrl.setVariable("poolSlippageRatio", 0);


        const uniswapRouterMock = await smock.fake(this.UniswapRouter);
        await uniswapRouterMock.swapExactTokensForTokens.returns([1,1])


        const PriceFeedMock = await ethers.getContractFactory("PriceFeedMock");
        const priceFeedMock= await smock.fake(PriceFeedMock);
        let block =  await ethers.provider.getBlock("latest");
        await priceFeedMock.latestRoundData.returns([1, 1, block.timestamp+600, block.timestamp+600, 1])

        await ctrl.setVariable("oracles", {
            "0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f": priceFeedMock.address,
        })


        await ctrl.setVariable("oracles", {
            "0x6d925938Edb8A16B3035A4cF34FAA090f490202a" : priceFeedMock.address,
        })

        await ctrl.setVariable("oracles", {
            "0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E" : priceFeedMock.address,
        })

        await ctrl.setVariable("exchange", uniswapRouterMock.address);

        await ctrl.setVariable("swapSlippageRatio", 10000);

        await ctrl.pause();
        await ctrl.unpause();
        const btcCrvMock = await smock.fake(this.Token, {address: "0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4"});
        await btcCrvMock.balanceOf.returns("100000000000000000000000000000000000000");
        await btcCrvMock.approve.returns(true);
        await aliceAccount.sendTransaction({
            to: mockController.address,
            value: ethers.utils.parseEther("1.0"),
        })
        await expect(ctrl.connect(mockController.wallet).retireStrat()).to.emit(ctrl, "Harvested");
                                                                                           
    })


    it("should call retire strat to harvest, not from controller, fail", async()=>{
        const ctrl = await this.ControllerCurveStratMock.deploy(MOCK_ADDRESS, MOCK_ADDRESS, MOCK_ADDRESS);
        await expect(ctrl.retireStrat()).to.be.revertedWith("Not from controller");
                                                                                           
    })

    

})