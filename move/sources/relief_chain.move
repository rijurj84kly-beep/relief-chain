module relief_chain::relief_chain {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use sui::event;
    use std::string::{Self, String};

    // Error codes
    const EAmountMismatch: u64 = 0;
    const EUnauthorized: u64 = 1;
    const ECampaignEnded: u64 = 2;
    const EInsufficientFunds: u64 = 3;

    // Capabilities
    public struct AdminCap has key, store {
        id: UID,
    }

    // Main crisis/disaster campaign shared object
    public struct Campaign has key {
        id: UID,
        title: String,
        description: String,
        location: String,
        severity: u8,
        goal: u64, // target goal in MIST
        funds_raised: Balance<SUI>,
        creator: address,
        status: u8, // 0 = Active, 1 = Fully Funded, 2 = Completed
        proofs: vector<ReliefProof>,
    }

    public struct ReliefProof has store, copy, drop {
        title: String,
        coordinates: String,
        walrus_blob_id: String,
        timestamp: u64,
    }

    // Events
    public struct CampaignCreated has copy, drop {
        campaign_id: ID,
        title: String,
        creator: address,
        goal: u64,
    }

    public struct DonationReceived has copy, drop {
        campaign_id: ID,
        donor: address,
        amount: u64,
    }

    public struct ProofPublished has copy, drop {
        campaign_id: ID,
        title: String,
        walrus_blob_id: String,
    }

    public struct FundsWithdrawn has copy, drop {
        campaign_id: ID,
        amount: u64,
        recipient: address,
    }

    fun init(ctx: &mut TxContext) {
        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        transfer::public_transfer(admin_cap, tx_context::sender(ctx));
    }

    public entry fun create_campaign(
        title: vector<u8>,
        description: vector<u8>,
        location: vector<u8>,
        severity: u8,
        goal: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let id = object::new(ctx);
        let campaign_id = object::uid_to_inner(&id);

        let campaign = Campaign {
            id,
            title: string::utf8(title),
            description: string::utf8(description),
            location: string::utf8(location),
            severity,
            goal,
            funds_raised: balance::zero(),
            creator: sender,
            status: 0,
            proofs: vector::empty(),
        };

        event::emit(CampaignCreated {
            campaign_id,
            title: campaign.title,
            creator: sender,
            goal,
        });

        transfer::share_object(campaign);
    }

    public entry fun donate(
        campaign: &mut Campaign,
        payment: &mut Coin<SUI>,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(campaign.status == 0, ECampaignEnded);
        assert!(coin::value(payment) >= amount, EAmountMismatch);

        let sender = tx_context::sender(ctx);
        let coin_to_donate = coin::split(payment, amount, ctx);
        let balance_to_donate = coin::into_balance(coin_to_donate);
        
        balance::join(&mut campaign.funds_raised, balance_to_donate);

        if (balance::value(&campaign.funds_raised) >= campaign.goal) {
            campaign.status = 1;
        };

        event::emit(DonationReceived {
            campaign_id: object::uid_to_inner(&campaign.id),
            donor: sender,
            amount,
        });
    }

    public entry fun publish_proof(
        campaign: &mut Campaign,
        title: vector<u8>,
        coordinates: vector<u8>,
        walrus_blob_id: vector<u8>,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(campaign.creator == sender, EUnauthorized);

        let proof = ReliefProof {
            title: string::utf8(title),
            coordinates: string::utf8(coordinates),
            walrus_blob_id: string::utf8(walrus_blob_id),
            timestamp: sui::clock::timestamp_ms(clock),
        };

        vector::push_back(&mut campaign.proofs, proof);

        event::emit(ProofPublished {
            campaign_id: object::uid_to_inner(&campaign.id),
            title: proof.title,
            walrus_blob_id: proof.walrus_blob_id,
        });
    }

    public entry fun withdraw_funds(
        campaign: &mut Campaign,
        amount: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(campaign.creator == sender, EUnauthorized);

        let funds_available = balance::value(&campaign.funds_raised);
        assert!(funds_available >= amount, EInsufficientFunds);

        let withdrawn_balance = balance::split(&mut campaign.funds_raised, amount);
        let withdrawn_coin = coin::from_balance(withdrawn_balance, ctx);

        transfer::public_transfer(withdrawn_coin, sender);

        event::emit(FundsWithdrawn {
            campaign_id: object::uid_to_inner(&campaign.id),
            amount,
            recipient: sender,
        });
    }

    public entry fun complete_campaign(
        campaign: &mut Campaign,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(campaign.creator == sender, EUnauthorized);
        campaign.status = 2; // Completed
    }

    // Read-only getter functions for integration/verification
    public fun get_title(campaign: &Campaign): String {
        campaign.title
    }

    public fun get_description(campaign: &Campaign): String {
        campaign.description
    }

    public fun get_location(campaign: &Campaign): String {
        campaign.location
    }

    public fun get_severity(campaign: &Campaign): u8 {
        campaign.severity
    }

    public fun get_goal(campaign: &Campaign): u64 {
        campaign.goal
    }

    public fun get_funds_raised(campaign: &Campaign): u64 {
        balance::value(&campaign.funds_raised)
    }

    public fun get_creator(campaign: &Campaign): address {
        campaign.creator
    }

    public fun get_status(campaign: &Campaign): u8 {
        campaign.status
    }

    public fun get_proofs_count(campaign: &Campaign): u64 {
        vector::length(&campaign.proofs)
    }
}
