#[test_only]
module relief_chain::relief_chain_tests {
    use sui::test_scenario::{Self, Scenario};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::clock::{Self, Clock};
    use relief_chain::relief_chain::{Self, Campaign, AdminCap};

    // Addresses for test scenarios
    const DEPLOYER: address = @0x10;
    const NGO_CREATOR: address = @0x20;
    const DONOR: address = @0x30;
    const STRANGER: address = @0x40;

    #[test]
    fun test_campaign_lifecycle() {
        let mut scenario_val = test_scenario::begin(DEPLOYER);
        let scenario = &mut scenario_val;

        // Step 1: Initialize module (automatically sends AdminCap to deployer)
        // Since init is private, we simulate it or start directly.
        // Actually, init is called by deployment, so we can check it.
        // In our case, create_campaign is public entry. Let's create a campaign with NGO_CREATOR.
        test_scenario::next_tx(scenario, NGO_CREATOR);
        {
            relief_chain::create_campaign(
                b"Cyclone Recovery", // title
                b"Emergency aid response for Cyclone Remal", // description
                b"Sundarbans", // location
                3, // severity (critical)
                1000000000, // goal (1 SUI in MIST)
                test_scenario::ctx(scenario)
            );
        };

        // Step 2: Verify campaign details
        test_scenario::next_tx(scenario, DONOR);
        {
            let mut campaign = test_scenario::take_shared<Campaign>(scenario);
            
            assert!(relief_chain::get_status(&campaign) == 0, 101);
            assert!(relief_chain::get_goal(&campaign) == 1000000000, 102);
            assert!(relief_chain::get_funds_raised(&campaign) == 0, 103);
            assert!(relief_chain::get_creator(&campaign) == NGO_CREATOR, 104);
            assert!(relief_chain::get_proofs_count(&campaign) == 0, 105);

            // Step 3: Donor contributes funds
            // Mint test coin
            let mut donor_coin = coin::mint_for_testing<SUI>(1500000000, test_scenario::ctx(scenario));
            relief_chain::donate(
                &mut campaign,
                &mut donor_coin,
                1000000000, // Donate 1 SUI
                test_scenario::ctx(scenario)
            );

            // Confirm campaign received the funds and status updated (goal met)
            assert!(relief_chain::get_funds_raised(&campaign) == 1000000000, 106);
            assert!(relief_chain::get_status(&campaign) == 1, 107); // Status 1 = Fully Funded

            // Refund remaining test SUI back to donor
            transfer::public_transfer(donor_coin, DONOR);
            test_scenario::return_shared(campaign);
        };

        // Step 4: NGO Creator publishes relief delivery proof
        test_scenario::next_tx(scenario, NGO_CREATOR);
        {
            let mut campaign = test_scenario::take_shared<Campaign>(scenario);
            let clock = clock::create_for_testing(test_scenario::ctx(scenario));

            relief_chain::publish_proof(
                &mut campaign,
                b"300 Filters Dispatched", // title
                b"22.18 N, 88.85 E", // coordinates
                b"walrus_remal_dispatch_invoice", // walrus blob id
                &clock,
                test_scenario::ctx(scenario)
            );

            assert!(relief_chain::get_proofs_count(&campaign) == 1, 108);

            clock::destroy_for_testing(clock);
            test_scenario::return_shared(campaign);
        };

        // Step 5: NGO Creator withdraws funds for milestone deployment
        test_scenario::next_tx(scenario, NGO_CREATOR);
        {
            let mut campaign = test_scenario::take_shared<Campaign>(scenario);

            relief_chain::withdraw_funds(
                &mut campaign,
                800000000, // withdraw 0.8 SUI
                test_scenario::ctx(scenario)
            );

            assert!(relief_chain::get_funds_raised(&campaign) == 200000000, 109);

            test_scenario::return_shared(campaign);
        };

        // Step 6: Verify NGO received withdrawn coin
        test_scenario::next_tx(scenario, NGO_CREATOR);
        {
            let withdrawn_coin = test_scenario::take_from_sender<Coin<SUI>>(scenario);
            assert!(coin::value(&withdrawn_coin) == 800000000, 110);
            test_scenario::return_to_sender(scenario, withdrawn_coin);
        };

        test_scenario::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = relief_chain::relief_chain::EUnauthorized)]
    fun test_unauthorized_withdrawal() {
        let mut scenario_val = test_scenario::begin(DEPLOYER);
        let scenario = &mut scenario_val;

        // NGO creates campaign
        test_scenario::next_tx(scenario, NGO_CREATOR);
        {
            relief_chain::create_campaign(
                b"Flood Rehabilitation",
                b"Assam Flood recovery efforts",
                b"Majuli",
                2,
                500000000,
                test_scenario::ctx(scenario)
            );
        };

        // Stranger tries to withdraw campaign funds
        test_scenario::next_tx(scenario, STRANGER);
        {
            let mut campaign = test_scenario::take_shared<Campaign>(scenario);
            relief_chain::withdraw_funds(
                &mut campaign,
                100000,
                test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(campaign);
        };

        test_scenario::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = relief_chain::relief_chain::EUnauthorized)]
    fun test_unauthorized_proof_publication() {
        let mut scenario_val = test_scenario::begin(DEPLOYER);
        let scenario = &mut scenario_val;

        // NGO creates campaign
        test_scenario::next_tx(scenario, NGO_CREATOR);
        {
            relief_chain::create_campaign(
                b"Flood Rehabilitation",
                b"Assam Flood recovery efforts",
                b"Majuli",
                2,
                500000000,
                test_scenario::ctx(scenario)
            );
        };

        // Stranger tries to publish proof
        test_scenario::next_tx(scenario, STRANGER);
        {
            let mut campaign = test_scenario::take_shared<Campaign>(scenario);
            let clock = clock::create_for_testing(test_scenario::ctx(scenario));
            relief_chain::publish_proof(
                &mut campaign,
                b"Fake Proof",
                b"Coordinates",
                b"walrus_fake_id",
                &clock,
                test_scenario::ctx(scenario)
            );
            clock::destroy_for_testing(clock);
            test_scenario::return_shared(campaign);
        };

        test_scenario::end(scenario_val);
    }
}
