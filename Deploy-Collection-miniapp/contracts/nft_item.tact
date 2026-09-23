import "./messages.tact";

// TEP-62 NFT item. Address is deterministic from (index, collection address) alone,
// so it is deployed with empty owner/content and immediately initialized by the
// collection via `Initialize` right after.
contract NftItem {
    index: Int as uint256;
    collection: Address;
    owner: Address;
    content: Cell;
    inited: Bool;

    init(index: Int, collection: Address) {
        self.index = index;
        self.collection = collection;
        self.owner = collection;
        self.content = emptyCell();
        self.inited = false;
    }

    receive(msg: Initialize) {
        require(!self.inited, "already initialized");
        require(sender() == self.collection, "only collection can initialize");
        self.owner = msg.owner;
        self.content = msg.content;
        self.inited = true;
    }

    receive(msg: Transfer) {
        require(self.inited, "not initialized");
        require(sender() == self.owner, "not owner");
        let prevOwner: Address = self.owner;
        self.owner = msg.newOwner;

        if (msg.forwardAmount > 0) {
            send(SendParameters{
                to: msg.newOwner,
                value: msg.forwardAmount,
                bounce: false,
                body: OwnershipAssigned{
                    queryId: msg.queryId,
                    prevOwner: prevOwner,
                    forwardPayload: msg.forwardPayload,
                }.toCell(),
            });
        }

        nativeReserve(0, ReserveExact);
        send(SendParameters{
            to: msg.responseDestination,
            value: 0,
            mode: SendRemainingBalance | SendIgnoreErrors,
            bounce: false,
            body: Excesses{queryId: msg.queryId}.toCell(),
        });
    }

    receive(msg: GetStaticData) {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue | SendIgnoreErrors,
            bounce: false,
            body: ReportStaticData{
                queryId: msg.queryId,
                index: self.index,
                collection: self.collection,
            }.toCell(),
        });
    }

    get fun get_nft_data(): NftData {
        return NftData{
            inited: self.inited,
            index: self.index,
            collection: self.collection,
            owner: self.owner,
            individualContent: self.content,
        };
    }
}

struct NftData {
    inited: Bool;
    index: Int;
    collection: Address;
    owner: Address;
    individualContent: Cell;
}
