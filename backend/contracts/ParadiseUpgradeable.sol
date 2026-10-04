// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./IPriceFeeds.sol";

/// @notice Supra S-Value Router interface (Cronos)
interface ISupraRouter {
    function checkPrice(string memory marketPair) external view returns (uint256 price, uint256 decimals);
}

/// @notice Witnet Price Router interface (Cronos)
interface IWitnetPriceRouter {
    function getPrice(bytes4 id) external view returns (int32 price, uint32 timestamp, uint32 drTxHash);
}

contract ParadiseUpgradeable is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {

    // Constants
    uint256 public constant MAX_REFERRALS = 2;
    uint256 public constant MAX_LEVELS = 12;
    uint256 public constant MAX_AUTO_UPGRADES = 12;

    uint256 public constant REGISTRATION_FEE_USD = 2e8;
    uint256 public constant MAX_ORACLE_STALENESS = 3600;

    uint256[13] public levelCostsUSD;

    // Price Feeds
    address public __deprecated_priceFeed;
    IPyth public pyth;
    IStdReference public band;
    bytes32 public pythPriceId;

    // User data structure
    struct User {
        address id;
        address referrer;
        uint256 level;
        uint256 directReferrals;
        uint256 totalReferrals;
        uint256 totalEarnings;
        uint256 lastActiveTime;
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
    event ManualUpgrade(address indexed user, uint256 level, uint256 amount);
    event ReserveUpdated(address indexed user, uint256 level, uint256 reservedAmount);
    event UserRecycled(address indexed user, address indexed newReferrer);
    event ReserveReleased(address indexed user, uint256 level, uint256 amount);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event MatrixParentSet(address indexed user, address indexed parent);
    event ReferralCapUpdated(uint256 oldCap, uint256 newCap);
    event ManualPriceSet(uint256 croUsdPrice, uint256 registrationFeeCro);
    event UserMigrated(address indexed user);
    event DownlineBackfilled(address indexed user, uint256 totalDownline);
    event ReserveCredited(address indexed user, uint256 level, uint256 amount);
    event PayoutSent(address indexed user, uint256 amount);
    event PayoutDeferred(address indexed user, uint256 amount);
    event ReservesDeposited(address indexed sender, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _pythAddress,
        address _bandAddress,
        bytes32 _pythPriceId,
        address _supraRouter,
        address _witnetRouter,
        bytes4 _witnetPriceId
    ) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        pyth = IPyth(_pythAddress);
        band = IStdReference(_bandAddress);
        pythPriceId = _pythPriceId;
        supraRouter = ISupraRouter(_supraRouter);
        witnetRouter = IWitnetPriceRouter(_witnetRouter);
        witnetPriceId = _witnetPriceId;

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

        referralCap = 62;

        // Create the owner account as the first user (deployer)
        User storage owner = users[msg.sender];
        owner.id = msg.sender;
        owner.level = MAX_LEVELS;
        owner.lastActiveTime = block.timestamp;
        userAddresses.push(msg.sender);

        subtreeSlots[msg.sender] = MAX_REFERRALS;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @notice Owner can set any user's level (for fixing first two users to MAX_LEVELS)
    function setUserLevel(address user, uint256 level) external onlyOwner {
        require(users[user].id != address(0), "User not registered");
        require(level >= 1 && level <= MAX_LEVELS, "Invalid level");
        users[user].level = level;
        if (level < MAX_LEVELS) {
            cachedNextLevelCost[user] = getLevelUpgradeCostCro(level + 1);
        } else {
            cachedNextLevelCost[user] = 0;
        }
    }



    // Additional price feed routers (added after original storage layout to preserve slots)
    ISupraRouter public supraRouter;
    IWitnetPriceRouter public witnetRouter;
    bytes4 public witnetPriceId;

    // Commission counter for tracking every 3rd commission (levels 4-12)
    mapping(address => uint256) public commissionCount;
    // Deferred payout balance. Commissions are paid straight to the user's wallet
    // via _sendPayout; this mapping only holds amounts whose direct transfer failed
    // (or legacy balances from before direct payouts), claimable via withdraw().
    mapping(address => uint256) public pendingWithdrawals;
    // Emergency pause
    bool public paused;

    // Matrix placement (explicit parent stored, no on-chain search)
    mapping(address => address) public matrixParent;
    mapping(address => address[]) public matrixChildren;

    // Referral usage cap (max 50 registrations per referrer)
    mapping(address => uint256) public referralCount;

    // Cached next-level upgrade cost per user (avoids oracle calls during commission flow)
    mapping(address => uint256) public cachedNextLevelCost;

    // Dynamic referral cap (was constant, moved here to preserve storage layout)
    uint256 public referralCap;

    // Subtree open-slot counter for O(depth) on-chain placement (added after referralCap)
    mapping(address => uint256) public subtreeSlots;

    // Manual fallback prices (added last to preserve existing storage layout)
    uint256 public manualRegistrationFeeCro;
    uint256[13] public manualLevelCostsCro;
    uint256 public manualCroUsdPrice;

    // Migration tracking for existing users from old contract version
    mapping(address => bool) public isMigrated;

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    // Internal: try all price sources (oracles first, then manual USD price), return 0 if all fail
    function _tryGetCroUsdPrice() internal view returns (uint256) {
        // 1. Try Witnet price router
        if (address(witnetRouter) != address(0) && witnetPriceId != bytes4(0)) {
            try witnetRouter.getPrice(witnetPriceId) returns (int32 price, uint32 timestamp, uint32 /* drTxHash */) {
                if (price > 0 && timestamp > 0 && block.timestamp - timestamp <= MAX_ORACLE_STALENESS) {
                    return uint256(uint32(price));
                }
            } catch {}
        }

        // 2. Try Pyth Network
        if (address(pyth) != address(0)) {
            try pyth.getPriceUnsafe(pythPriceId) returns (IPyth.Price memory price) {
                if (price.price > 0 && block.timestamp - price.publishTime <= MAX_ORACLE_STALENESS) {
                    uint256 p = uint256(uint64(price.price));
                    if (price.expo <= -8) {
                        return p / (10 ** uint256(uint32(-price.expo - 8)));
                    } else {
                        return p * (10 ** uint256(uint32(8 + price.expo)));
                    }
                }
            } catch {}
        }

        // 3. Try Band Protocol
        if (address(band) != address(0)) {
            try band.getReferenceData("CRO", "USD") returns (IStdReference.ReferenceData memory data) {
                if (data.rate > 0 && block.timestamp - data.lastUpdatedBase <= MAX_ORACLE_STALENESS) {
                    return data.rate / 1e10;
                }
            } catch {}
        }

        // 4. Try Supra S-Value feed
        if (address(supraRouter) != address(0)) {
            try supraRouter.checkPrice("CRO/USD") returns (uint256 price, uint256 decimals) {
                if (price > 0) {
                    if (decimals < 8) {
                        return price * (10 ** uint256(uint32(8 - decimals)));
                    } else if (decimals > 8) {
                        return price / (10 ** uint256(uint32(decimals - 8)));
                    } else {
                        return price;
                    }
                }
            } catch {}
        }

        // 5. Last resort: manual owner-set USD price
        if (manualCroUsdPrice > 0) {
            return manualCroUsdPrice;
        }

        return 0;
    }

    // Get current CRO/USD price from multi-source feeds (8 decimals)
    function getCroUsdPrice() public view returns (uint256) {
        uint256 price = _tryGetCroUsdPrice();
        require(price > 0, "All price feeds failed or are stale");
        return price;
    }

    // Calculate CRO amount needed for USD amount (returns 0 if price unavailable)
    function calculateCroAmount(uint256 usdAmount) public view returns (uint256) {
        uint256 croPrice = _tryGetCroUsdPrice();
        if (croPrice == 0) return 0;
        return (usdAmount * 1e18) / croPrice;
    }

    // Get registration fee in CRO — tries oracles first, then manual fixed CRO fee
    function getRegistrationFeeCro() public view returns (uint256) {
        uint256 amount = calculateCroAmount(REGISTRATION_FEE_USD);
        if (amount > 0) return amount;
        if (manualRegistrationFeeCro > 0) return manualRegistrationFeeCro;
        return 0;
    }

    // Get level upgrade cost in CRO — tries oracles first, then manual fixed CRO cost
    function getLevelUpgradeCostCro(uint256 level) public view returns (uint256) {
        if (level < 2 || level > MAX_LEVELS) return 0;
        uint256 amount = calculateCroAmount(levelCostsUSD[level]);
        if (amount > 0) return amount;
        if (manualLevelCostsCro[level] > 0) return manualLevelCostsCro[level];
        return 0;
    }

    // Update price feed configuration (only owner)
    function setPriceFeeds(
        address _pyth,
        address _band,
        bytes32 _pythPriceId
    ) external onlyOwner {
        pyth = IPyth(_pyth);
        band = IStdReference(_band);
        pythPriceId = _pythPriceId;
    }

    function setNewPriceFeeds(
        address _pyth,
        address _band,
        bytes32 _pythPriceId,
        address _supraRouter,
        address _witnetRouter,
        bytes4 _witnetPriceId
    ) external onlyOwner {
        pyth = IPyth(_pyth);
        band = IStdReference(_band);
        pythPriceId = _pythPriceId;
        supraRouter = ISupraRouter(_supraRouter);
        witnetRouter = IWitnetPriceRouter(_witnetRouter);
        witnetPriceId = _witnetPriceId;
    }

    /// @notice Set manual CRO/USD fallback price (owner only)
    function setManualCroUsdPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Price must be > 0");
        manualCroUsdPrice = _price;
        emit ManualPriceSet(_price, manualRegistrationFeeCro);
    }

    /// @notice Set manual fallback costs in CRO (owner only, for emergency use)
    function setManualCroCosts(uint256 _regFeeCro, uint256[13] calldata _levelCostsCro) external onlyOwner {
        manualRegistrationFeeCro = _regFeeCro;
        manualLevelCostsCro = _levelCostsCro;
        emit ManualPriceSet(manualCroUsdPrice, _regFeeCro);
    }

    /// @notice Get all manual level costs in one call (admin panel RPC optimization)
    function getManualLevelCosts() external view returns (uint256[13] memory) {
        return manualLevelCostsCro;
    }

    /// @notice Emergency pause/unpause all payment functions
    function togglePause() external onlyOwner {
        paused = !paused;
        if (paused) emit Paused(msg.sender);
        else emit Unpaused(msg.sender);
    }

    /// @notice Set dynamic referral cap (owner only)
    function setReferralCap(uint256 _cap) external onlyOwner {
        require(_cap > 0, "Cap must be > 0");
        emit ReferralCapUpdated(referralCap, _cap);
        referralCap = _cap;
    }

    /// @notice Safe version of getLevelUpgradeCostCro that returns 0 instead of reverting
    function _getLevelCostSafe(uint256 level) internal view returns (uint256) {
        uint256 amount = calculateCroAmount(levelCostsUSD[level]);
        if (amount > 0) return amount;
        if (manualLevelCostsCro[level] > 0) return manualLevelCostsCro[level];
        return 0;
    }

    /// @notice Batch migration: backfill matrixParent, matrixChildren, subtreeSlots,
    ///         cachedNextLevelCost, and referralCount for existing pre-upgrade users.
    /// @param startIndex  Starting index in userAddresses array
    /// @param batchSize   Number of users to process in this call
    function migrateUserBatch(uint256 startIndex, uint256 batchSize) external onlyOwner {
        uint256 totalUsers = userAddresses.length;
        require(startIndex < totalUsers, "Start index out of bounds");

        uint256 endIndex = startIndex + batchSize;
        if (endIndex > totalUsers) endIndex = totalUsers;

        for (uint256 i = startIndex; i < endIndex; i++) {
            address userAddr = userAddresses[i];

            if (isMigrated[userAddr]) continue;
            if (userAddr == owner()) {
                isMigrated[userAddr] = true;
                emit UserMigrated(userAddr);
                continue;
            }

            User storage user = users[userAddr];
            require(user.id != address(0), "Invalid user");

            // 1. Set matrixParent from existing referrer
            if (user.referrer != address(0) && matrixParent[userAddr] == address(0)) {
                matrixParent[userAddr] = user.referrer;
            }

            // 2. Add to matrixChildren of referrer (deduplicate)
            if (user.referrer != address(0)) {
                address[] storage siblings = matrixChildren[user.referrer];
                bool found = false;
                for (uint256 j = 0; j < siblings.length; j++) {
                    if (siblings[j] == userAddr) { found = true; break; }
                }
                if (!found) {
                    siblings.push(userAddr);
                }
            }

            // 3. Set cachedNextLevelCost for next upgrade (skip if price unavailable)
            if (user.level < MAX_LEVELS && cachedNextLevelCost[userAddr] == 0) {
                uint256 safeCost = _getLevelCostSafe(user.level + 1);
                if (safeCost > 0) {
                    cachedNextLevelCost[userAddr] = safeCost;
                }
            }

            // 4. Set referralCount from existing directReferrals
            if (referralCount[userAddr] == 0 && user.directReferrals > 0) {
                referralCount[userAddr] = user.directReferrals;
            }

            // 5. Set base subtreeSlots for this user
            if (subtreeSlots[userAddr] == 0) {
                subtreeSlots[userAddr] = MAX_REFERRALS;
            }

            // 6. Increment subtreeSlots for all ancestors up the chain
            address ancestor = matrixParent[userAddr];
            uint256 depth = 0;
            while (ancestor != address(0) && depth < 100) {
                subtreeSlots[ancestor]++;
                ancestor = matrixParent[ancestor];
                depth++;
            }

            // NOTE: the rigid 12-upline cache for migrated users is populated by
            // backfillUplinesBatch (one owner sweep covers all pre-upgrade users).

            isMigrated[userAddr] = true;
            emit UserMigrated(userAddr);
        }
    }

    /// @notice Get migration progress count
    function getMigratedCount() external view returns (uint256) {
        uint256 count = 0;
        uint256 len = userAddresses.length;
        uint256 maxCheck = len < 2000 ? len : 2000;
        for (uint256 i = 0; i < maxCheck; i++) {
            if (isMigrated[userAddresses[i]]) count++;
        }
        return count;
    }

    /// @notice Get number of users whose totalDownline has been backfilled
    function getDownlineBackfillCount() external view returns (uint256) {
        uint256 count = 0;
        uint256 len = userAddresses.length;
        uint256 maxCheck = len < 2000 ? len : 2000;
        for (uint256 i = 0; i < maxCheck; i++) {
            if (downlineBackfilled[userAddresses[i]]) count++;
        }
        return count;
    }

    /// @notice Batch backfill totalDownline for existing pre-upgrade users.
    ///         Must run AFTER migrateUserBatch so matrixParent/matrixChildren are populated.
    ///         Processes the array in REVERSE (children are registered after their parents,
    ///         so a parent's subtree is only tallied once all descendants have been counted).
    /// @param startIndex  Starting index in userAddresses array
    /// @param batchSize   Number of users to process in this call
    function backfillDownlineBatch(uint256 startIndex, uint256 batchSize) external onlyOwner {
        uint256 totalUsers = userAddresses.length;
        require(startIndex < totalUsers, "Start index out of bounds");

        uint256 endIndex = startIndex + batchSize;
        if (endIndex > totalUsers) endIndex = totalUsers;

        for (uint256 i = endIndex; i > startIndex; i--) {
            address userAddr = userAddresses[i - 1];
            if (downlineBackfilled[userAddr]) continue;

            User storage user = users[userAddr];
            if (user.id == address(0)) continue;

            uint256 total = 0;
            address[] storage children = matrixChildren[userAddr];
            for (uint256 j = 0; j < children.length; j++) {
                total += 1 + totalDownline[children[j]];
            }

            totalDownline[userAddr] = total;
            downlineBackfilled[userAddr] = true;
            emit DownlineBackfilled(userAddr, total);
        }
    }

    // Get total pending withdrawal balance
    function getTotalWithdrawableBalance(address userAddress) public view returns (uint256) {
        require(users[userAddress].id != address(0), "User not registered");
        return pendingWithdrawals[userAddress];
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

    function register(address _referrer, address _placementParent, address[] calldata _pathProof) external payable nonReentrant whenNotPaused {
        require(users[msg.sender].id == address(0), "Reg'd");
        require(_referrer != address(0), "Ref 0");
        require(users[_referrer].id != address(0), "Ref not reg");
        uint256 regFee = getRegistrationFeeCro();
        require(regFee > 0, "Price feed offline");
        require(msg.value >= regFee, "Fee low");
        require(_placementParent != address(0), "Place parent 0");
        require(users[_placementParent].id != address(0), "Place parent not reg");
        require(matrixChildren[_placementParent].length < MAX_REFERRALS, "Place parent full");
        require(referralCap == 0 || referralCount[_referrer] < referralCap, "Ref cap");

        // Path proof: verifies _placementParent is in _referrer's matrix tree
        // Each consecutive pair (path[i], path[i+1]) must satisfy matrixParent[path[i]] == path[i+1]
        require(_pathProof.length >= 1, "Path empty");
        require(_pathProof[0] == _placementParent, "Path must start with _placementParent");
        require(_pathProof[_pathProof.length - 1] == _referrer, "Path must end with _referrer");
        if (_pathProof.length >= 2) {
            for (uint256 i = 0; i < _pathProof.length - 1; i++) {
                require(matrixParent[_pathProof[i]] == _pathProof[i + 1], "Invalid matrix path");
            }
        } else {
            // Single-element path valid only when placementParent == referrer (root chain)
            require(_placementParent == _referrer, "Path too short for diff parent/ref");
        }

        _executeRegistration(_referrer, _placementParent, msg.value);
    }

    /// @notice Fully on-chain registration: placement is computed inside the
    ///         contract via _findNextSlotInternal, so clients send just
    ///         (referrer + fee) — zero off-chain placement calculation and
    ///         zero extra RPC calls (no findNextSlot / path-proof reads).
    ///         Economics, reserves and events are identical to register().
    function registerAuto(address _referrer) external payable nonReentrant whenNotPaused {
        require(users[msg.sender].id == address(0), "Reg'd");
        require(_referrer != address(0), "Ref 0");
        require(users[_referrer].id != address(0), "Ref not reg");
        uint256 regFee = getRegistrationFeeCro();
        require(regFee > 0, "Price feed offline");
        require(msg.value >= regFee, "Fee low");
        require(referralCap == 0 || referralCount[_referrer] < referralCap, "Ref cap");

        address _placementParent = _findNextSlotInternal(_referrer);
        require(_placementParent != address(0), "Tree full");
        require(matrixChildren[_placementParent].length < MAX_REFERRALS, "Place parent full");

        _executeRegistration(_referrer, _placementParent, msg.value);
    }

    /// @dev Shared placement/payment logic for register() and registerAuto().
    function _executeRegistration(address _sponsor, address _placementParent, uint256 _payment) internal {
        User storage user = users[msg.sender];
        user.id = msg.sender;
        user.referrer = _placementParent;
        if (_placementParent == owner() && users[owner()].directReferrals < 2) {
            user.level = MAX_LEVELS;
        } else {
            user.level = 1;
        }
        user.lastActiveTime = block.timestamp;
        userAddresses.push(msg.sender);

        cachedNextLevelCost[msg.sender] = getLevelUpgradeCostCro(2);

        matrixParent[msg.sender] = _placementParent;
        matrixChildren[_placementParent].push(msg.sender);
        referralCount[_sponsor]++;

        // Rigid splayed storage: freeze the 12-upline chain now (links are
        // immutable, so this never goes stale). Payouts read this flat array.
        address _cursor = _placementParent;
        for (uint256 k = 0; k < 12; k++) {
            uplineCache[msg.sender][k] = _cursor;
            if (_cursor == address(0)) break;
            _cursor = matrixParent[_cursor];
        }
        uplinesBackfilled[msg.sender] = true;

        // subtreeSlots: new user starts with 2 open slots; increment ancestors up to depth 100
        subtreeSlots[msg.sender] = MAX_REFERRALS;
        address ancestor = _placementParent;
        uint256 depth = 0;
        while (ancestor != address(0) && depth < 100) {
            subtreeSlots[ancestor]++;
            totalDownline[ancestor]++;
            ancestor = matrixParent[ancestor];
            depth++;
        }

        emit MatrixParentSet(msg.sender, _placementParent);

        _processPayment(msg.sender, _payment, 1);

        User storage placementParentUser = users[_placementParent];
        placementParentUser.directReferrals++;
        placementParentUser.totalReferrals++;

        emit UserRegistered(msg.sender, _placementParent);
    }


    // Upgrade using external wallet (step-by-step only)
    function walletUpgrade() external payable nonReentrant whenNotPaused {
        User storage user = users[msg.sender];
        require(user.id != address(0), "Not reg");
        uint256 level = user.level + 1;
        require(level <= MAX_LEVELS, "Max level");

        uint256 upgradeCost = getLevelUpgradeCostCro(level);
        require(upgradeCost > 0, "Price feed offline");
        require(msg.value >= upgradeCost, "Payment low");

        if (msg.value > upgradeCost) {
            (bool success, ) = payable(msg.sender).call{value: msg.value - upgradeCost}("");
            require(success, "Refund failed");
        }

        _executeUpgrade(msg.sender, level, upgradeCost, "manual");
    }

    // Upgrade from reserved balance (step-by-step only)
    function upgradeFromReserve() external nonReentrant whenNotPaused {
        User storage user = users[msg.sender];
        require(user.id != address(0), "Not reg");
        uint256 level = user.level + 1;
        require(level <= MAX_LEVELS, "Max level");

        uint256 upgradeCost = getLevelUpgradeCostCro(level);
        require(upgradeCost > 0, "Price feed offline");
        require(user.reservedForUpgrade[level] >= upgradeCost, "Insufficient reserve");

        user.reservedForUpgrade[level] -= upgradeCost;
        _executeUpgrade(msg.sender, level, upgradeCost, "manual");
    }

    // Internal upgrade execution logic
    function _executeUpgrade(address userAddress, uint256 level, uint256 cost, string memory upgradeType) internal {
        users[userAddress].level = level;
        users[userAddress].lastActiveTime = block.timestamp;

        if (level < MAX_LEVELS) {
            cachedNextLevelCost[userAddress] = getLevelUpgradeCostCro(level + 1);
        } else {
            cachedNextLevelCost[userAddress] = 0;
        }

        if (users[userAddress].referrer != address(0)) {
            _processPayment(userAddress, cost, level);
        }

        _releaseReserves(userAddress, level);

        emit ManualUpgrade(userAddress, level, cost);
        emit UserUpgraded(userAddress, level, upgradeType);
    }

    /// @notice Auto-upgrade a user when their reserved pot covers the next level cost.
    ///         Only uses the user's own reserve (never contract-wide balance), never fires
    ///         when the cost is unknown (0), and is capped by MAX_AUTO_UPGRADES per tx so a
    ///         payment cascade cannot blow past the gas limit.
    function _tryAutoUpgrade(address userAddress) internal {
        User storage user = users[userAddress];
        if (user.level >= MAX_LEVELS) return;
        if (autoUpgradeDepth >= MAX_AUTO_UPGRADES) return;

        uint256 nextLevel = user.level + 1;
        // Use the cached next-level cost (refreshed on every registration/upgrade and
        // by setUserLevel) so a payment cascade never re-queries price oracles per step.
        // Fall back to the live getter only when the cache is empty (feeds were down).
        uint256 upgradeCost = cachedNextLevelCost[userAddress];
        if (upgradeCost == 0) {
            upgradeCost = getLevelUpgradeCostCro(nextLevel);
            if (upgradeCost == 0) return;
        }
        if (user.reservedForUpgrade[nextLevel] < upgradeCost) return;

        autoUpgradeDepth++;
        user.reservedForUpgrade[nextLevel] -= upgradeCost;
        _executeUpgrade(userAddress, nextLevel, upgradeCost, "auto");
        autoUpgradeDepth--;
    }


    // Get user info
    function getUserInfo(address userAddress) public view returns (
        address id,
        address referrer,
        uint256 level,
        uint256 directReferrals,
        uint256 totalReferrals,
        uint256 totalEarnings,
        uint256 lastActiveTime
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
            user.lastActiveTime
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

        // Populate per-level withdrawable from storage (preserved from old system)
        for (uint256 i = 1; i <= MAX_LEVELS; i++) {
            withdrawableBalance[i] = users[userAddress].withdrawableBalance[i];
        }

        return (
            _getLevelEarnings(userAddress),
            _getReservedForUpgrade(userAddress),
            withdrawableBalance,
            getTotalWithdrawableBalance(userAddress),
            getTotalReservedBalance(userAddress)
        );
    }

    // Release reserved funds for levels up to the new level
    function _releaseReserves(address userAddress, uint256 newLevel) internal {
        User storage user = users[userAddress];

        // Fast path: reserves only ever accumulate at user.level + 1 (written by
        // _applySplitWithCap), and every upgrade releases all levels <= newLevel.
        // So right before a release, the ONLY possibly non-zero reserve is
        // reservedForUpgrade[newLevel] (leftover that was not consumed by the upgrade).
        // If that is empty, every lower level is empty too and the loop is pure waste.
        if (user.reservedForUpgrade[newLevel] == 0) return;

        uint256 releasedTotal = 0;
        for (uint256 i = 1; i <= newLevel; i++) {
            uint256 reserved = user.reservedForUpgrade[i];
            if (reserved > 0) {
                user.reservedForUpgrade[i] = 0;
                releasedTotal += reserved;
                emit ReserveReleased(userAddress, i, reserved);
            }
        }
        
        if (releasedTotal > 0) {
            _sendPayout(userAddress, releasedTotal);
        }
    }

    // SAFE PUSH: delivers a payout with a low-level .call (never transfer()).
    // If the call returns false (blocked/malicious recipient or thin balance)
    // the loop MUST NOT revert or stop — the amount is routed into
    // emergencyBalances[recipient] and execution continues with the next
    // upline. Funds stay pullable via claimMissedEarnings() and are never lost.
    function _sendPayout(address recipient, uint256 amount) internal {
        if (amount == 0 || recipient == address(0)) return;
        // Native-CRO push: empty calldata + value. This is the native-asset
        // equivalent of an ERC20 abi.encodeWithSignature("transfer(address,uint256)")
        // low-level push — no transfer()/transferFrom() anywhere in payout paths.
        (bool success, ) = payable(recipient).call{value: amount}("");
        if (success) {
            emit PayoutSent(recipient, amount);
        } else {
            emergencyBalances[recipient] += amount;
            emit PayoutDeferred(recipient, amount);
        }
    }

    /// @notice Pull any commissions whose automatic push failed, plus any legacy
    ///         pendingWithdrawals balance. Because failed pushes never revert the
    ///         payout loop, every missed earning ends up claimable here.
    function claimMissedEarnings() external nonReentrant whenNotPaused {
        uint256 amount = emergencyBalances[msg.sender] + pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to claim");
        require(address(this).balance >= amount, "Insufficient contract balance");
        emergencyBalances[msg.sender] = 0;
        pendingWithdrawals[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Claim failed");
        emit Withdrawal(msg.sender, amount, 0);
    }

    /// @notice Total pullable missed earnings (failed pushes + legacy pending) — 1 RPC.
    function getTotalMissedEarnings(address userAddress) external view returns (uint256) {
        return emergencyBalances[userAddress] + pendingWithdrawals[userAddress];
    }

    /// @notice Owner-only backfill of the rigid 12-upline cache for pre-upgrade
    ///         users. New registrations populate it automatically.
    /// @param startIndex  Starting index in userAddresses array
    /// @param batchSize   Number of users to process in this call
    function backfillUplinesBatch(uint256 startIndex, uint256 batchSize) external onlyOwner {
        uint256 totalUsers = userAddresses.length;
        require(startIndex < totalUsers, "Start index out of bounds");

        uint256 endIndex = startIndex + batchSize;
        if (endIndex > totalUsers) endIndex = totalUsers;

        for (uint256 i = startIndex; i < endIndex; i++) {
            address userAddr = userAddresses[i];
            if (uplinesBackfilled[userAddr]) continue;
            if (users[userAddr].id == address(0)) continue;

            address cursor = matrixParent[userAddr];
            for (uint256 k = 0; k < 12; k++) {
                uplineCache[userAddr][k] = cursor;
                if (cursor == address(0)) break;
                cursor = matrixParent[cursor];
            }
            uplinesBackfilled[userAddr] = true;
        }
    }

    // Claim a deferred payout balance (only non-zero if a direct wallet transfer
    // failed or the balance predates direct payouts)
    function withdraw() external nonReentrant whenNotPaused {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        require(address(this).balance >= amount, "Insufficient contract balance");
        pendingWithdrawals[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Withdrawal failed");
        emit Withdrawal(msg.sender, amount, 0);
    }

    /// @notice Accept native CRO deposits to fund contract reserves / liquidity
    receive() external payable {
        emit ReservesDeposited(msg.sender, msg.value);
    }

    fallback() external payable {
        emit ReservesDeposited(msg.sender, msg.value);
    }

    /// @notice Explicit reserve deposit function
    function depositReserves() external payable {
        require(msg.value > 0, "Zero amount");
        emit ReservesDeposited(msg.sender, msg.value);
    }

    // Process payment to nth upline with 50/50 split and reserve caps
    function _processPayment(address payer, uint256 amount, uint256 level) internal {
        address target = _getNthUpline(payer, level);

        if (target != address(0) && users[target].level >= level) {
            // Every 3rd commission for levels 4-12: 2% to owner, 98% to target
            if (level >= 4 && level <= 12) {
                commissionCount[target]++;
                if (commissionCount[target] % 3 == 0) {
                    uint256 ownerPortion = (amount * 2) / 100;
                    uint256 targetPortion = amount - ownerPortion;

                    users[owner()].totalEarnings += ownerPortion;
                    users[owner()].levelEarnings[level] += ownerPortion;
                    _applySplitWithCap(owner(), ownerPortion);
                    emit PaymentReceived(payer, owner(), ownerPortion, level);

                    users[target].totalEarnings += targetPortion;
                    users[target].levelEarnings[level] += targetPortion;
                    _applySplitWithCap(target, targetPortion);
                    emit PaymentReceived(payer, target, targetPortion, level);

                    return;
                }
            }
            // Primary target is qualified, they get full amount
            users[target].totalEarnings += amount;
            users[target].levelEarnings[level] += amount;
            _applySplitWithCap(target, amount);
            emit PaymentReceived(payer, target, amount, level);
        } else {
            // Target is unqualified or doesn't exist
            // Search for a qualified upline (max 12 levels upward via matrixParent chain)
            address qualifiedUpline = target != address(0)
                ? _findQualifiedUpline(target, level)
                : _findQualifiedUpline(payer, level);

            if (qualifiedUpline != address(0)) {
                // Qualified found: unqualified target gets 10%, qualified gets 50%, owner gets 40%
                uint256 ownerShare = amount;

                if (target != address(0)) {
                    uint256 tenPercent = amount / 10;
                    users[target].totalEarnings += tenPercent;
                    users[target].levelEarnings[level] += tenPercent;
                    _applySplitWithCap(target, tenPercent);
                    emit PaymentReceived(payer, target, tenPercent, level);
                    ownerShare -= tenPercent;
                }

                uint256 fiftyPercent = amount / 2;
                users[qualifiedUpline].totalEarnings += fiftyPercent;
                users[qualifiedUpline].levelEarnings[level] += fiftyPercent;
                _applySplitWithCap(qualifiedUpline, fiftyPercent);
                emit PaymentReceived(payer, qualifiedUpline, fiftyPercent, level);
                ownerShare -= fiftyPercent;

                if (ownerShare > 0) {
                    users[owner()].totalEarnings += ownerShare;
                    users[owner()].levelEarnings[level] += ownerShare;
                    _applySplitWithCap(owner(), ownerShare);
                    emit PaymentReceived(payer, owner(), ownerShare, level);
                }
            } else {
                // No qualified upline found in 12-level search: full amount to owner
                users[owner()].totalEarnings += amount;
                users[owner()].levelEarnings[level] += amount;
                _applySplitWithCap(owner(), amount);
                emit PaymentReceived(payer, owner(), amount, level);
            }
        }
    }

    // Apply 50/50 split with reserve cap
    function _applySplitWithCap(address userAddress, uint256 amount) internal {
        User storage user = users[userAddress];

        uint256 halfAmount = amount / 2;
        uint256 remainingHalf = amount - halfAmount;

        uint256 reserveCap = 0;
        uint256 nextLevel = 0;
        if (user.level < MAX_LEVELS) {
            nextLevel = user.level + 1;
            uint256 liveCost = _getLevelCostSafe(nextLevel);
            if (liveCost > 0) {
                cachedNextLevelCost[userAddress] = liveCost;
                reserveCap = liveCost;
            } else {
                reserveCap = cachedNextLevelCost[userAddress];
                if (reserveCap == 0) {
                    reserveCap = getLevelUpgradeCostCro(nextLevel);
                }
            }
        }

        uint256 currentReserved = user.reservedForUpgrade[nextLevel];

        uint256 payoutAmount = 0;

        if (currentReserved >= reserveCap) {
            payoutAmount = amount;
        } else {
            uint256 availableReserveSpace = reserveCap - currentReserved;

            if (halfAmount <= availableReserveSpace) {
                user.reservedForUpgrade[nextLevel] += halfAmount;
                payoutAmount = remainingHalf;
                emit ReserveUpdated(userAddress, nextLevel, halfAmount);
            } else {
                user.reservedForUpgrade[nextLevel] += availableReserveSpace;
                uint256 overflow = halfAmount - availableReserveSpace;
                payoutAmount = remainingHalf + overflow;
                emit ReserveUpdated(userAddress, nextLevel, availableReserveSpace);
            }
        }

        if (payoutAmount > 0) {
            _sendPayout(userAddress, payoutAmount);
        }

        if (user.level < MAX_LEVELS) {
            _tryAutoUpgrade(userAddress);
        }
    }

    // Find qualified upline for a specific level. Reads the pre-saved flat
    // 12-array linearly for backfilled users (strictly predictable gas);
    // legacy users fall back to the bounded chain walk until backfilled.
    function _findQualifiedUpline(address user, uint256 level) internal view returns (address) {
        if (uplinesBackfilled[user]) {
            for (uint256 i = 0; i < MAX_LEVELS; i++) {
                address upline = uplineCache[user][i];
                if (upline == address(0)) break;
                if (users[upline].level >= level) {
                    return upline;
                }
            }
            return address(0);
        }

        address currentUpline = matrixParent[user];
        for (uint256 i = 0; i < MAX_LEVELS && currentUpline != address(0); i++) {
            if (users[currentUpline].level >= level) {
                return currentUpline;
            }
            currentUpline = matrixParent[currentUpline];
        }

        return address(0);
    }

    // Get the nth upline of a user. Prefers the pre-saved flat 12-array
    // (O(1) read); legacy users use the bounded walk until backfilled.
    function _getNthUpline(address user, uint256 n) internal view returns (address) {
        if (uplinesBackfilled[user]) return uplineCache[user][n - 1];

        address current = matrixParent[user];
        for (uint256 i = 1; i < n && current != address(0); i++) {
            current = matrixParent[current];
        }
        return current;
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

    // Get total users count
    function getTotalUsers() external view returns (uint256) {
        return userAddresses.length;
    }

    // Get reserved balance at specific level
    function getReservedBalance(address userAddress, uint256 level) external view returns (uint256) {
        require(level >= 1 && level <= MAX_LEVELS, "Invalid level");
        require(users[userAddress].id != address(0), "Not reg");
        return users[userAddress].reservedForUpgrade[level];
    }

    // ===== MATRIX DOWNLINE QUERIES (reads stored children, no on-chain search) =====

    uint256 private constant MAX_DOWNLINE_BATCH = 2000;

    /// @notice Get paginated downline from stored matrix children (single-pass)
    function getDownlinePaginated(address userAddress, uint256 depth, uint256 offset, uint256 count)
        external view returns (address[] memory members, uint256 total)
    {
        require(users[userAddress].id != address(0), "Not reg");
        require(depth > 0 && depth <= 20, "Depth 1-20");

        address[] memory queue = new address[](MAX_DOWNLINE_BATCH);
        uint256 qStart = 0;
        uint256 qEnd = 0;

        {
            address[] storage children = matrixChildren[userAddress];
            for (uint256 i = 0; i < children.length && qEnd < MAX_DOWNLINE_BATCH; i++) {
                queue[qEnd++] = children[i];
            }
        }

        total = 0;
        uint256 currentDepth = 1;
        uint256 remaining = qEnd - qStart;

        while (qStart < qEnd && currentDepth <= depth) {
            if (remaining == 0) {
                currentDepth++;
                remaining = qEnd - qStart;
                if (currentDepth > depth) break;
            }

            qStart++;
            remaining--;
            total++;

            address current = queue[qStart - 1];
            address[] storage childList = matrixChildren[current];
            for (uint256 i = 0; i < childList.length && qEnd < MAX_DOWNLINE_BATCH; i++) {
                queue[qEnd++] = childList[i];
            }
        }

        if (offset >= total) return (new address[](0), total);
        if (count == 0 || offset + count > total) count = total - offset;
        if (count > MAX_DOWNLINE_BATCH) count = MAX_DOWNLINE_BATCH;

        members = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            members[i] = queue[offset + i];
        }
    }

    /// @notice Get parent (referrer) info for a user
    function getUserParentInfo(address userAddress) external view returns (address referrer, uint256 referrerLevel) {
        require(users[userAddress].id != address(0), "Not reg");
        referrer = users[userAddress].referrer;
        referrerLevel = users[referrer].level;
    }

    /// @notice Get full matrix children array for an address (needed because mapping getter is indexed)
    function getMatrixChildren(address userAddress) external view returns (address[] memory) {
        return matrixChildren[userAddress];
    }

    /// @notice Find next available slot using balanced subtree placement (O(depth))
    function findNextSlot(address root) external view returns (address) {
        require(users[root].id != address(0), "Not reg");
        return _findNextSlotInternal(root);
    }

    /// @notice Internal slot search shared by the view and on-chain auto-registration
    ///         (no off-chain tree walk needed).
    function _findNextSlotInternal(address root) internal view returns (address) {
        address current = root;
        uint256 depth = 0;
        while (depth < 200) {
            depth++;
            address[] storage kids = matrixChildren[current];
            if (kids.length < MAX_REFERRALS) return current;

            // Both children exist — check if any direct child has open slots first
            if (matrixChildren[kids[0]].length < MAX_REFERRALS) {
                current = kids[0];
            } else if (kids.length > 1 && matrixChildren[kids[1]].length < MAX_REFERRALS) {
                current = kids[1];
            } else if (kids.length > 1 && totalDownline[kids[0]] <= totalDownline[kids[1]]) {
                current = kids[0];
            } else if (kids.length > 1) {
                current = kids[1];
            } else {
                current = kids[0];
            }
        }
        return address(0);
    }

    /// @notice Build the matrix path placementParent -> ... -> referrer on-chain.
    ///         Replaces the former off-chain loop that walked `matrixParent` with
    ///         up to 100 sequential RPC calls — now a single view call.
    function _buildPlacementPath(address placementParent, address referrer)
        internal
        view
        returns (address[] memory)
    {
        if (placementParent == referrer) {
            address[] memory single = new address[](1);
            single[0] = placementParent;
            return single;
        }
        address[] memory tmp = new address[](101);
        uint256 len = 0;
        address current = placementParent;
        for (uint256 i = 0; i < 100; i++) {
            tmp[len++] = current;
            current = matrixParent[current];
            if (current == address(0)) break;
            if (current == referrer) {
                tmp[len++] = current;
                break;
            }
        }
        require(len > 0 && tmp[len - 1] == referrer, "Not in tree");
        address[] memory path = new address[](len);
        for (uint256 i = 0; i < len; i++) {
            path[i] = tmp[i];
        }
        return path;
    }

    /// @notice Find the balanced slot AND its path proof in ONE RPC
    ///         (replaces findNextSlot + up-to-100 matrixParent reads).
    function findNextSlotAndProof(address root)
        external
        view
        returns (address slot, address[] memory path)
    {
        require(users[root].id != address(0), "Not reg");
        slot = _findNextSlotInternal(root);
        require(slot != address(0), "Tree full");
        path = _buildPlacementPath(slot, root);
    }

    struct SystemInfo {
        uint256 registrationFeeCro;
        uint256[12] levelCostsCro;
        uint256 croUsdPrice;
        uint256 totalUsers;
    }

    /// @notice Aggregate system-wide info — replaces 4 separate RPC calls
    function getSystemInfo() external view returns (SystemInfo memory) {
        uint256 croPrice = _tryGetCroUsdPrice();
        uint256[12] memory costs;
        for (uint256 i = 1; i <= MAX_LEVELS; i++) {
            uint256 amount;
            if (croPrice > 0) {
                amount = (levelCostsUSD[i] * 1e18) / croPrice;
            }
            if (amount > 0) {
                costs[i - 1] = amount;
            } else if (manualLevelCostsCro[i] > 0) {
                costs[i - 1] = manualLevelCostsCro[i];
            }
        }
        uint256 regFee;
        if (croPrice > 0) {
            regFee = (REGISTRATION_FEE_USD * 1e18) / croPrice;
        }
        if (regFee == 0) regFee = manualRegistrationFeeCro;
        return SystemInfo({
            registrationFeeCro: regFee,
            levelCostsCro: costs,
            croUsdPrice: croPrice,
            totalUsers: userAddresses.length
        });
    }

    // ===== BATCH OPERATIONS (gas-optimized) =====

    /// @notice Get multiple user infos in one RPC call (reduces round trips)
    function getUserInfosBatch(address[] calldata addresses) external view returns (
        address[] memory ids,
        address[] memory referrers,
        uint256[] memory levels,
        uint256[] memory directReferrals,
        uint256[] memory totalReferrals,
        uint256[] memory totalEarnings,
        uint256[] memory lastActiveTimes
    ) {
        uint256 len = addresses.length;
        require(len > 0 && len <= 50, "Batch 1-50");

        ids = new address[](len);
        referrers = new address[](len);
        levels = new uint256[](len);
        directReferrals = new uint256[](len);
        totalReferrals = new uint256[](len);
        totalEarnings = new uint256[](len);
        lastActiveTimes = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            User storage user = users[addresses[i]];
            if (user.id != address(0)) {
                ids[i] = user.id;
                referrers[i] = user.referrer;
                levels[i] = user.level;
                directReferrals[i] = user.directReferrals;
                totalReferrals[i] = user.totalReferrals;
                totalEarnings[i] = user.totalEarnings;
                lastActiveTimes[i] = user.lastActiveTime;
            }
        }
    }

    /// @notice Get multiple level costs in one RPC call
    function getLevelCostsCroBatch(uint256[] calldata levels) external view returns (uint256[] memory costs) {
        uint256 len = levels.length;
        require(len > 0 && len <= 12, "Batch 1-12");
        costs = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            if (levels[i] >= 2 && levels[i] <= MAX_LEVELS) {
                costs[i] = getLevelUpgradeCostCro(levels[i]);
            }
        }
    }

    /// @notice Paginated user address list (for frontend pagination)
    function getUserAddressesPaginated(uint256 startIndex, uint256 count) external view returns (address[] memory) {
        uint256 len = userAddresses.length;
        if (startIndex >= len) return new address[](0);
        uint256 endIndex = startIndex + count;
        if (endIndex > len) endIndex = len;

        uint256 size = endIndex - startIndex;
        address[] memory result = new address[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = userAddresses[startIndex + i];
        }
        return result;
    }

    /// @dev Reserved storage slots for future upgrades
    uint256 private autoUpgradeDepth;

    // Exact, always-up-to-date downline count per user.
    // On every registration this is incremented for ALL ancestors of the new member
    // (walking matrixParent), so a user's count reflects their full subtree. O(1) to read,
    // scales to millions of members without on-chain traversal.
    mapping(address => uint256) public totalDownline;

    /// @dev True once a user's totalDownline was backfilled from the existing tree (migration only).
    mapping(address => bool) public downlineBackfilled;

    /// @dev True once a user's lost reserve was credited back by the owner via
    ///      creditMigratedReserves() (one-time settlement of the first migration).
    mapping(address => bool) public settlementCredited;

    // ===== SAFE-PUSH PAYOUT STORAGE (rigid splayed layout, predictable gas) =====
    /// @dev Pre-computed 12-upline chain per user, frozen at registration.
    ///      matrixParent links are immutable, so this flat array never goes stale.
    ///      Payout resolution reads this array linearly — no live tree search.
    mapping(address => address[12]) public uplineCache;
    /// @dev True once uplineCache[user] has been populated (at registration or
    ///      via backfillUplinesBatch / migrateUserBatch for pre-upgrade users).
    mapping(address => bool) public uplinesBackfilled;
    /// @dev Push-to-fail escape hatch: every automatic payout uses a low-level
    ///      .call; if it returns false the loop does NOT revert — the amount is
    ///      routed here and stays pullable via claimMissedEarnings().
    mapping(address => uint256) public emergencyBalances;

    /// @notice One-time settlement for the first migration: credits each user's
    ///         next-level reserve (`reservedForUpgrade[level+1]`) with the amount
    ///         they lost when reserve balances were not carried over. Idempotent —
    ///         users already credited are skipped, so batches can be safely re-run.
    /// @param userList  Array of migrated user addresses
    /// @param amountList  Per-user credit in wei, credited to reservedForUpgrade[level+1]
    function creditMigratedReserves(address[] calldata userList, uint256[] calldata amountList) external onlyOwner {
        require(userList.length == amountList.length, "Length mismatch");
        require(userList.length > 0 && userList.length <= 50, "Batch 1-50");

        for (uint256 i = 0; i < userList.length; i++) {
            address userAddr = userList[i];
            if (settlementCredited[userAddr]) continue;

            User storage user = users[userAddr];
            require(user.id != address(0), "Not reg");
            require(user.level < MAX_LEVELS, "Max level");

            uint256 targetLevel = user.level + 1;
            user.reservedForUpgrade[targetLevel] += amountList[i];
            settlementCredited[userAddr] = true;

            emit ReserveCredited(userAddr, targetLevel, amountList[i]);
        }
    }

    uint256[27] private __gap;
}