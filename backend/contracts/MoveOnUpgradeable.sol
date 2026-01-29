// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./IPriceFeeds.sol";

contract MoveOnUpgradeable is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {

    // Constants
    uint256 public constant MAX_REFERRALS = 2;
    uint256 public constant MAX_LEVELS = 12;
    uint256 public constant INACTIVE_DAYS = 100;
    uint256 public constant REGISTRATION_FEE_USD = 2e8; // $2 (8 decimals for Chainlink)

    // Level costs in USD (8 decimals for Chainlink price feed)
    uint256[13] public levelCostsUSD;

    // Price Feeds
    AggregatorV3Interface public priceFeed; // Chainlink
    IPyth public pyth;                      // Pyth Network
    IStdReference public band;              // Band Protocol
    bytes32 public pythPriceId;             // Pyth Price ID for CRO/USD

    // User data structure
    struct User {
        address id;
        address referrer;
        uint256 level;
        uint256 directReferrals;
        uint256 totalReferrals;
        uint256 totalEarnings;
        uint256 lastActiveTime;
        bool isExpired;
        address[] referrals;

        // Enhanced financial structure
        mapping(uint256 => uint256) reservedForUpgrade;
        mapping(uint256 => uint256) withdrawableBalance;
        mapping(uint256 => uint256) levelEarnings;
    }

    // Mapping from address to user
    mapping(address => User) public users;

    // Array of all user addresses
    address[] public userAddresses;

    // Events
    event UserRegistered(address indexed user, address indexed referrer);
    event UserUpgraded(address indexed user, uint256 newLevel, string upgradeType);
    event PaymentReceived(address indexed user, address indexed receiver, uint256 amount, uint256 level);
    event Withdrawal(address indexed user, uint256 amount, uint256 level);
    event QuickUpgrade(address indexed user, uint256 level, uint256 amount);
    event WalletUpgrade(address indexed user, uint256 level, uint256 amount);
    event ReserveUpdated(address indexed user, uint256 level, uint256 reservedAmount);
    event UserRecycled(address indexed user, address indexed newReferrer);
    event UserExpired(address indexed user);
    event UserReactivated(address indexed user);
    event ReserveReleased(address indexed user, uint256 level, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _priceFeedAddress,
        address _pythAddress,
        address _bandAddress,
        bytes32 _pythPriceId
    ) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        priceFeed = AggregatorV3Interface(_priceFeedAddress);
        pyth = IPyth(_pythAddress);
        band = IStdReference(_bandAddress);
        pythPriceId = _pythPriceId;

        levelCostsUSD = [
            0, // Level 0 (not used)
            0, // Level 1 (registration fee)
            2e8,   // Level 2: $2
            4e8,   // Level 3: $4
            8e8,   // Level 4: $8
            16e8,  // Level 5: $16
            32e8,  // Level 6: $32
            64e8,  // Level 7: $64
            128e8, // Level 8: $128
            256e8, // Level 9: $256
            512e8, // Level 10: $512
            1024e8,// Level 11: $1024
            2048e8 // Level 12: $2048
        ];

        // Create the owner account as the first user (deployer)
        User storage owner = users[msg.sender];
        owner.id = msg.sender;
        owner.level = MAX_LEVELS;
        owner.lastActiveTime = block.timestamp;
        userAddresses.push(msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // Manual fallback prices (set by owner if feeds fail)
    uint256 public manualRegistrationFeeCro; // in wei (18 decimals)
    uint256[13] public manualLevelCostsCro;   // in wei (18 decimals)

    // Get current CRO/USD price from multi-source feeds (8 decimals)
    function getCroUsdPrice() public view returns (uint256) {
        // 1. Try Pyth Network
        if (address(pyth) != address(0)) {
            try pyth.getPriceUnsafe(pythPriceId) returns (IPyth.Price memory price) {
                // Validate data (24 hours timeout for mainnet)
                if (price.price > 0 && block.timestamp - price.publishTime <= 86400) {
                    // Convert Pyth price to 8 decimals
                    uint256 p = uint256(uint64(price.price));
                    if (price.expo <= -8) {
                        return p / (10 ** uint256(uint32(-price.expo - 8)));
                    } else {
                        return p * (10 ** uint256(uint32(8 + price.expo)));
                    }
                }
            } catch {}
        }

        // 2. Try Band Protocol
        if (address(band) != address(0)) {
            try band.getReferenceData("CRO", "USD") returns (IStdReference.ReferenceData memory data) {
                if (data.rate > 0 && block.timestamp - data.lastUpdatedBase <= 86400) {
                    // Band rate is 18 decimals, convert to 8 decimals
                    return data.rate / 1e10;
                }
            } catch {}
        }

        // 3. Try Chainlink
        if (address(priceFeed) != address(0)) {
            try priceFeed.latestRoundData() returns (
                uint80 roundId,
                int256 answer,
                uint256 startedAt,
                uint256 updatedAt,
                uint80 answeredInRound
            ) {
                if (answer > 0 && block.timestamp - updatedAt <= 86400) {
                    return uint256(answer);
                }
            } catch {}
        }

        revert("All price feeds failed or are stale");
    }

    // Calculate CRO amount needed for USD amount
    function calculateCroAmount(uint256 usdAmount) public view returns (uint256) {
        uint256 croPrice = getCroUsdPrice();
        return (usdAmount * 1e18) / croPrice;
    }

    // Get registration fee in CRO
    function getRegistrationFeeCro() public view returns (uint256) {
        return calculateCroAmount(REGISTRATION_FEE_USD);
    }

    // Get level upgrade cost in CRO
    function getLevelUpgradeCostCro(uint256 level) public view returns (uint256) {
        require(level >= 2 && level <= MAX_LEVELS, "Invalid level");
        return calculateCroAmount(levelCostsUSD[level]);
    }

    // Update price feed configuration (only owner)
    function setPriceFeeds(
        address _priceFeed,
        address _pyth,
        address _band,
        bytes32 _pythPriceId
    ) external onlyOwner {
        priceFeed = AggregatorV3Interface(_priceFeed);
        pyth = IPyth(_pyth);
        band = IStdReference(_band);
        pythPriceId = _pythPriceId;
    }

    // Get total withdrawable balance across all levels
    function getTotalWithdrawableBalance(address userAddress) public view returns (uint256) {
        User storage user = users[userAddress];
        require(user.id != address(0), "User not registered");

        uint256 total = 0;
        for (uint256 i = 1; i <= MAX_LEVELS; i++) {
            total += user.withdrawableBalance[i];
        }
        return total;
    }

    // Get total reserved balance across all levels
    function getTotalReservedBalance(address userAddress) public view returns (uint256) {
        User storage user = users[userAddress];
        require(user.id != address(0), "User not registered");

        uint256 total = 0;
        for (uint256 i = 1; i <= MAX_LEVELS; i++) {
            total += user.reservedForUpgrade[i];
        }
        return total;
    }

    // Register a new user
    function register(address _referrer) external payable nonReentrant {
        require(users[msg.sender].id == address(0), "Reg'd");
        require(_referrer != address(0), "Ref 0");
        require(users[_referrer].id != address(0), "Ref not reg");
        require(msg.value >= getRegistrationFeeCro(), "Fee low");

        // Determine actual placement (handle spillover before payment)
        address actualReferrer = _referrer;
        if (users[_referrer].directReferrals >= MAX_REFERRALS) {
            actualReferrer = _findSpilloverPlacement(_referrer);
        }

        // Create new user
        User storage user = users[msg.sender];
        user.id = msg.sender;
        user.referrer = actualReferrer;
        user.level = 1;
        user.lastActiveTime = block.timestamp;
        userAddresses.push(msg.sender);

        // Process registration fee to actual referrer
        _processPayment(msg.sender, msg.value, 1);

        // Update actual referrer's direct referrals
        User storage referrer = users[actualReferrer];
        referrer.directReferrals++;
        referrer.totalReferrals++;
        referrer.referrals.push(msg.sender);

        // Special case: First two users after deployer get level 12
        if (userAddresses.length <= 3) {
            user.level = MAX_LEVELS;
        }

        emit UserRegistered(msg.sender, actualReferrer);
    }

    // Quick upgrade using withdrawable balance
    function quickUpgrade(uint256 level) external nonReentrant {
        require(users[msg.sender].id != address(0), "Not reg");
        require(level > users[msg.sender].level, "Already at level");
        require(level <= MAX_LEVELS, "Invalid level");

        uint256 upgradeCost = getLevelUpgradeCostCro(level);
        uint256 totalWithdrawable = getTotalWithdrawableBalance(msg.sender);
        require(totalWithdrawable >= upgradeCost, "Balance low");

        _deductFromWithdrawableBalance(msg.sender, level, upgradeCost);
        _executeUpgrade(msg.sender, level, upgradeCost, "quick");
    }

    // Upgrade using external wallet
    function walletUpgrade(uint256 level) external payable nonReentrant {
        require(users[msg.sender].id != address(0), "Not reg");
        require(level > users[msg.sender].level, "Already at level");
        require(level <= MAX_LEVELS, "Invalid level");

        uint256 upgradeCost = getLevelUpgradeCostCro(level);
        require(msg.value >= upgradeCost, "Payment low");

        if (msg.value > upgradeCost) {
            payable(msg.sender).transfer(msg.value - upgradeCost);
        }

        _executeUpgrade(msg.sender, level, upgradeCost, "wallet");
    }

    // Internal upgrade execution logic
    function _executeUpgrade(address userAddress, uint256 level, uint256 cost, string memory upgradeType) internal {
        users[userAddress].level = level;
        users[userAddress].lastActiveTime = block.timestamp;

        if (users[userAddress].referrer != address(0)) {
            _processPayment(userAddress, cost, level);
        }

        _releaseReserves(userAddress, level);

        if (keccak256(bytes(upgradeType)) == keccak256(bytes("quick"))) {
            emit QuickUpgrade(userAddress, level, cost);
        } else {
            emit WalletUpgrade(userAddress, level, cost);
        }
        emit UserUpgraded(userAddress, level, upgradeType);
    }

    // Withdraw from withdrawable balance at specific level
    function withdrawFromLevel(uint256 level, uint256 amount) external nonReentrant {
        require(users[msg.sender].id != address(0), "Not reg");
        require(level >= 1 && level <= MAX_LEVELS, "Lvl inv");
        require(amount > 0, "Amt 0");

        User storage user = users[msg.sender];
        require(user.withdrawableBalance[level] >= amount, "Bal low");

        user.withdrawableBalance[level] -= amount;
        user.lastActiveTime = block.timestamp;

        payable(msg.sender).transfer(amount);

        emit Withdrawal(msg.sender, amount, level);
    }

    // Withdraw all withdrawable balance
    function withdrawAllWithdrawable() external nonReentrant {
        uint256 totalWithdrawable = getTotalWithdrawableBalance(msg.sender);
        require(totalWithdrawable > 0, "No withdrawable balance to withdraw");

        // Reset all withdrawable balances
        for (uint256 i = 1; i <= MAX_LEVELS; i++) {
            users[msg.sender].withdrawableBalance[i] = 0;
        }

        users[msg.sender].lastActiveTime = block.timestamp;
        payable(msg.sender).transfer(totalWithdrawable);

        emit Withdrawal(msg.sender, totalWithdrawable, 0);
    }

    // Deduct from withdrawable balance
    function _deductFromWithdrawableBalance(address userAddress, uint256 targetLevel, uint256 amount) internal {
        uint256 remaining = amount;

        if (users[userAddress].withdrawableBalance[targetLevel] >= remaining) {
            users[userAddress].withdrawableBalance[targetLevel] -= remaining;
            return;
        } else {
            remaining -= users[userAddress].withdrawableBalance[targetLevel];
            users[userAddress].withdrawableBalance[targetLevel] = 0;
        }

        for (uint256 i = 1; i <= MAX_LEVELS && remaining > 0; i++) {
            if (i == targetLevel) continue;

            uint256 levelBalance = users[userAddress].withdrawableBalance[i];
            if (levelBalance >= remaining) {
                users[userAddress].withdrawableBalance[i] -= remaining;
                remaining = 0;
            } else {
                remaining -= levelBalance;
                users[userAddress].withdrawableBalance[i] = 0;
            }
        }
    }

    // Get user info
    function getUserInfo(address userAddress) public view returns (
        address id,
        address referrer,
        uint256 level,
        uint256 directReferrals,
        uint256 totalReferrals,
        uint256 totalEarnings,
        uint256 lastActiveTime,
        bool isExpired
    ) {
        User storage user = users[userAddress];
        require(user.id != address(0), "User not registered");

        return (
            user.id,
            user.referrer,
            user.level,
            user.directReferrals,
            user.totalReferrals,
            user.totalEarnings,
            user.lastActiveTime,
            user.isExpired
        );
    }

    // Get user financial info
    function getUserFinancialInfo(address userAddress) public view returns (
        uint256[13] memory levelEarnings,
        uint256[13] memory reservedForUpgrade,
        uint256[13] memory withdrawableBalance,
        uint256 totalWithdrawableBalance,
        uint256 totalReservedBalance
    ) {
        require(users[userAddress].id != address(0), "Not reg");

        return (
            _getLevelEarnings(userAddress),
            _getReservedForUpgrade(userAddress),
            _getWithdrawableBalance(userAddress),
            getTotalWithdrawableBalance(userAddress),
            getTotalReservedBalance(userAddress)
        );
    }

    // Reactivate expired account
    function reactivateAccount() external payable nonReentrant {
        require(users[msg.sender].id != address(0), "Not reg");
        require(users[msg.sender].isExpired, "Not exp");
        require(msg.value >= getRegistrationFeeCro(), "Fee low");

        users[msg.sender].isExpired = false;
        users[msg.sender].lastActiveTime = block.timestamp;

        if (users[msg.sender].referrer != address(0)) {
            _processPayment(msg.sender, msg.value, 1);
        }

        emit UserReactivated(msg.sender);
    }

    // Get user's downline
    function getDownline(address userAddress, uint256 depth) external view returns (address[] memory) {
        require(users[userAddress].id != address(0), "Not reg");
        require(depth > 0, "Depth must be greater than 0");

        return _getDownlineRecursive(userAddress, depth);
    }

    // Check for inactive users and mark them as expired
    function checkInactiveUsers() external {
        for (uint256 i = 0; i < userAddresses.length; i++) {
            address userAddress = userAddresses[i];
            User storage user = users[userAddress];

            if (i < 3) continue;

            if (block.timestamp > user.lastActiveTime + INACTIVE_DAYS * 1 days && !user.isExpired) {
                user.isExpired = true;
                emit UserExpired(userAddress);
            }
        }
    }

    // Release reserved funds for levels up to the new level
    function _releaseReserves(address userAddress, uint256 newLevel) internal {
        User storage user = users[userAddress];

        for (uint256 i = 1; i <= newLevel; i++) {
            uint256 reserved = user.reservedForUpgrade[i];
            if (reserved > 0) {
                user.reservedForUpgrade[i] = 0;
                user.withdrawableBalance[i] += reserved;
                emit ReserveReleased(userAddress, i, reserved);
            }
        }
    }

    // Process payment to nth upline with 50/50 split and reserve caps
    function _processPayment(address payer, uint256 amount, uint256 level) internal {
        address target = _getNthUpline(payer, level);

        if (target != address(0) && users[target].level >= level) {
            users[target].totalEarnings += amount;
            users[target].levelEarnings[level] += amount;
            _applySplitWithCap(target, amount, level);
            emit PaymentReceived(payer, target, amount, level);
        } else if (target != address(0)) {
            uint256 ownerShare = amount / 2;
            uint256 uplineShare = amount - ownerShare;

            users[owner()].totalEarnings += ownerShare;
            users[owner()].levelEarnings[level] += ownerShare;
            _applySplitWithCap(owner(), ownerShare, level);

            users[target].totalEarnings += uplineShare;
            users[target].levelEarnings[level] += uplineShare;
            _applySplitWithCap(target, uplineShare, level);

            emit PaymentReceived(payer, target, uplineShare, level);
            emit PaymentReceived(payer, owner(), ownerShare, level);
        } else {
            users[owner()].totalEarnings += amount;
            users[owner()].levelEarnings[level] += amount;
            _applySplitWithCap(owner(), amount, level);
            emit PaymentReceived(payer, owner(), amount, level);
        }
    }

    // Apply 50/50 split with reserve cap
    function _applySplitWithCap(address userAddress, uint256 amount, uint256 level) internal {
        User storage user = users[userAddress];

        _checkAndPerformAutoUpgrade(userAddress);

        uint256 halfAmount = amount / 2;
        uint256 remainingHalf = amount - halfAmount;

        uint256 reserveCap = 0;
        uint256 nextLevel = 0;
        if (user.level < MAX_LEVELS) {
            nextLevel = user.level + 1;
            reserveCap = getLevelUpgradeCostCro(nextLevel);
        }

        uint256 currentReserved = user.reservedForUpgrade[nextLevel];

        if (currentReserved >= reserveCap) {
            user.withdrawableBalance[level] += amount;
        } else {
            uint256 availableReserveSpace = reserveCap - currentReserved;

            if (halfAmount <= availableReserveSpace) {
                user.reservedForUpgrade[nextLevel] += halfAmount;
                user.withdrawableBalance[level] += remainingHalf;
                emit ReserveUpdated(userAddress, nextLevel, halfAmount);
            } else {
                user.reservedForUpgrade[nextLevel] += availableReserveSpace;
                uint256 overflow = halfAmount - availableReserveSpace;
                user.withdrawableBalance[level] += remainingHalf + overflow;
                emit ReserveUpdated(userAddress, nextLevel, availableReserveSpace);
            }
        }

        _checkAndPerformAutoUpgrade(userAddress);
    }

    function _checkAndPerformAutoUpgrade(address userAddress) internal {
        User storage user = users[userAddress];
        if (user.level < MAX_LEVELS) {
            uint256 nextLevel = user.level + 1;
            uint256 upgradeCost = getLevelUpgradeCostCro(nextLevel);
            if (user.reservedForUpgrade[nextLevel] >= upgradeCost) {
                user.reservedForUpgrade[nextLevel] -= upgradeCost;
                user.level = nextLevel;
                user.lastActiveTime = block.timestamp;
                _processPayment(userAddress, upgradeCost, nextLevel);
                _releaseReserves(userAddress, nextLevel);
                emit UserUpgraded(userAddress, nextLevel, "automatic");
            }
        }
    }

    // Find a position for spillover placement
    function _findSpilloverPlacement(address referrer) internal view returns (address) {
        address[] memory downline = _getDownlineRecursive(referrer, 100);

        for (uint256 i = 0; i < downline.length; i++) {
            if (users[downline[i]].directReferrals < MAX_REFERRALS) {
                return downline[i];
            }
        }

        return referrer;
    }

    // Find qualified upline for a specific level
    function _findQualifiedUpline(address user, uint256 level) internal view returns (address) {
        address currentUpline = users[user].referrer;

        while (currentUpline != address(0)) {
            if (users[currentUpline].level >= level) {
                return currentUpline;
            }
            currentUpline = users[currentUpline].referrer;
        }

        return address(0);
    }

    // Get the nth upline of a user
    function _getNthUpline(address user, uint256 n) internal view returns (address) {
        address current = users[user].referrer;
        for (uint256 i = 1; i < n && current != address(0); i++) {
            current = users[current].referrer;
        }
        return current;
    }

    // Get downline addresses
    function _getDownlineRecursive(address userAddress, uint256 depth) internal view returns (address[] memory) {
        if (depth == 0) return new address[](0);

        User storage user = users[userAddress];
        uint256 len = user.referrals.length;
        if (len == 0) return new address[](0);

        address[] memory currentLevel = user.referrals;
        uint256 totalLength = len;
        
        // This is still Gas intensive but avoids double recursion
        for (uint256 i = 0; i < len; i++) {
            address[] memory sub = _getDownlineRecursive(currentLevel[i], depth - 1);
            totalLength += sub.length;
        }

        address[] memory result = new address[](totalLength);
        uint256 idx = 0;
        for (uint256 i = 0; i < len; i++) {
            result[idx++] = currentLevel[i];
        }
        for (uint256 i = 0; i < len; i++) {
            address[] memory sub = _getDownlineRecursive(currentLevel[i], depth - 1);
            for (uint256 j = 0; j < sub.length; j++) {
                result[idx++] = sub[j];
            }
        }
        return result;
    }

    // Helper functions to get arrays for frontend
    function _getLevelEarnings(address userAddress) internal view returns (uint256[13] memory) {
        uint256[13] memory earnings;
        for (uint256 i = 1; i <= MAX_LEVELS; i++) {
            earnings[i] = users[userAddress].levelEarnings[i];
        }
        return earnings;
    }

    function _getReservedForUpgrade(address userAddress) internal view returns (uint256[13] memory) {
        uint256[13] memory reserved;
        for (uint256 i = 1; i <= MAX_LEVELS; i++) {
            reserved[i] = users[userAddress].reservedForUpgrade[i];
        }
        return reserved;
    }

    function _getWithdrawableBalance(address userAddress) internal view returns (uint256[13] memory) {
        uint256[13] memory withdrawable;
        for (uint256 i = 0; i <= MAX_LEVELS; i++) {
            withdrawable[i] = users[userAddress].withdrawableBalance[i];
        }
        return withdrawable;
    }

    // Get total users count
    function getTotalUsers() external view returns (uint256) {
        return userAddresses.length;
    }

    // Get withdrawable balance at specific level
    function getWithdrawableBalance(address userAddress, uint256 level) external view returns (uint256) {
        require(level >= 1 && level <= MAX_LEVELS, "Invalid level");
        require(users[userAddress].id != address(0), "Not reg");
        return users[userAddress].withdrawableBalance[level];
    }

    // Get reserved balance at specific level
    function getReservedBalance(address userAddress, uint256 level) external view returns (uint256) {
        require(level >= 1 && level <= MAX_LEVELS, "Invalid level");
        require(users[userAddress].id != address(0), "Not reg");
        return users[userAddress].reservedForUpgrade[level];
    }


}