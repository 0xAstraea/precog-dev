/**
 * Permit2 libs for get deployed data and addresses
 *
 * Based on official repo: https://github.com/Uniswap/permit2
 */


export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";


export const PERMIT2_ABI = [{
    "inputs": [{"internalType": "uint256", "name": "deadline", "type": "uint256"}],
    "name": "AllowanceExpired",
    "type": "error"
}, {"inputs": [], "name": "ExcessiveInvalidation", "type": "error"}, {
    "inputs": [{
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
    }], "name": "InsufficientAllowance", "type": "error"
}, {
    "inputs": [{"internalType": "uint256", "name": "maxAmount", "type": "uint256"}],
    "name": "InvalidAmount",
    "type": "error"
}, {"inputs": [], "name": "InvalidContractSignature", "type": "error"}, {
    "inputs": [],
    "name": "InvalidNonce",
    "type": "error"
}, {"inputs": [], "name": "InvalidSignature", "type": "error"}, {
    "inputs": [],
    "name": "InvalidSignatureLength",
    "type": "error"
}, {"inputs": [], "name": "InvalidSigner", "type": "error"}, {
    "inputs": [],
    "name": "LengthMismatch",
    "type": "error"
}, {
    "inputs": [{"internalType": "uint256", "name": "signatureDeadline", "type": "uint256"}],
    "name": "SignatureExpired",
    "type": "error"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "owner", "type": "address"}, {
        "indexed": true,
        "internalType": "address",
        "name": "token",
        "type": "address"
    }, {"indexed": true, "internalType": "address", "name": "spender", "type": "address"}, {
        "indexed": false,
        "internalType": "uint160",
        "name": "amount",
        "type": "uint160"
    }, {"indexed": false, "internalType": "uint48", "name": "expiration", "type": "uint48"}],
    "name": "Approval",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "owner", "type": "address"}, {
        "indexed": false,
        "internalType": "address",
        "name": "token",
        "type": "address"
    }, {"indexed": false, "internalType": "address", "name": "spender", "type": "address"}],
    "name": "Lockdown",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "owner", "type": "address"}, {
        "indexed": true,
        "internalType": "address",
        "name": "token",
        "type": "address"
    }, {"indexed": true, "internalType": "address", "name": "spender", "type": "address"}, {
        "indexed": false,
        "internalType": "uint48",
        "name": "newNonce",
        "type": "uint48"
    }, {"indexed": false, "internalType": "uint48", "name": "oldNonce", "type": "uint48"}],
    "name": "NonceInvalidation",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "owner", "type": "address"}, {
        "indexed": true,
        "internalType": "address",
        "name": "token",
        "type": "address"
    }, {"indexed": true, "internalType": "address", "name": "spender", "type": "address"}, {
        "indexed": false,
        "internalType": "uint160",
        "name": "amount",
        "type": "uint160"
    }, {"indexed": false, "internalType": "uint48", "name": "expiration", "type": "uint48"}, {
        "indexed": false,
        "internalType": "uint48",
        "name": "nonce",
        "type": "uint48"
    }],
    "name": "Permit",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "owner", "type": "address"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "word",
        "type": "uint256"
    }, {"indexed": false, "internalType": "uint256", "name": "mask", "type": "uint256"}],
    "name": "UnorderedNonceInvalidation",
    "type": "event"
}, {
    "inputs": [],
    "name": "DOMAIN_SEPARATOR",
    "outputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "", "type": "address"}, {
        "internalType": "address",
        "name": "",
        "type": "address"
    }, {"internalType": "address", "name": "", "type": "address"}],
    "name": "allowance",
    "outputs": [{"internalType": "uint160", "name": "amount", "type": "uint160"}, {
        "internalType": "uint48",
        "name": "expiration",
        "type": "uint48"
    }, {"internalType": "uint48", "name": "nonce", "type": "uint48"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "token", "type": "address"}, {
        "internalType": "address",
        "name": "spender",
        "type": "address"
    }, {"internalType": "uint160", "name": "amount", "type": "uint160"}, {
        "internalType": "uint48",
        "name": "expiration",
        "type": "uint48"
    }], "name": "approve", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "token", "type": "address"}, {
        "internalType": "address",
        "name": "spender",
        "type": "address"
    }, {"internalType": "uint48", "name": "newNonce", "type": "uint48"}],
    "name": "invalidateNonces",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "wordPos", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "mask",
        "type": "uint256"
    }], "name": "invalidateUnorderedNonces", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{
        "components": [{
            "internalType": "address",
            "name": "token",
            "type": "address"
        }, {"internalType": "address", "name": "spender", "type": "address"}],
        "internalType": "struct IAllowanceTransfer.TokenSpenderPair[]",
        "name": "approvals",
        "type": "tuple[]"
    }], "name": "lockdown", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "", "type": "address"}, {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
    }],
    "name": "nonceBitmap",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{
        "internalType": "address",
        "name": "owner",
        "type": "address"
    }, {
        "components": [{
            "components": [{
                "internalType": "address",
                "name": "token",
                "type": "address"
            }, {"internalType": "uint160", "name": "amount", "type": "uint160"}, {
                "internalType": "uint48",
                "name": "expiration",
                "type": "uint48"
            }, {"internalType": "uint48", "name": "nonce", "type": "uint48"}],
            "internalType": "struct IAllowanceTransfer.PermitDetails[]",
            "name": "details",
            "type": "tuple[]"
        }, {"internalType": "address", "name": "spender", "type": "address"}, {
            "internalType": "uint256",
            "name": "sigDeadline",
            "type": "uint256"
        }], "internalType": "struct IAllowanceTransfer.PermitBatch", "name": "permitBatch", "type": "tuple"
    }, {"internalType": "bytes", "name": "signature", "type": "bytes"}],
    "name": "permit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{
        "internalType": "address",
        "name": "owner",
        "type": "address"
    }, {
        "components": [{
            "components": [{
                "internalType": "address",
                "name": "token",
                "type": "address"
            }, {"internalType": "uint160", "name": "amount", "type": "uint160"}, {
                "internalType": "uint48",
                "name": "expiration",
                "type": "uint48"
            }, {"internalType": "uint48", "name": "nonce", "type": "uint48"}],
            "internalType": "struct IAllowanceTransfer.PermitDetails",
            "name": "details",
            "type": "tuple"
        }, {"internalType": "address", "name": "spender", "type": "address"}, {
            "internalType": "uint256",
            "name": "sigDeadline",
            "type": "uint256"
        }], "internalType": "struct IAllowanceTransfer.PermitSingle", "name": "permitSingle", "type": "tuple"
    }, {"internalType": "bytes", "name": "signature", "type": "bytes"}],
    "name": "permit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{
        "components": [{
            "components": [{
                "internalType": "address",
                "name": "token",
                "type": "address"
            }, {"internalType": "uint256", "name": "amount", "type": "uint256"}],
            "internalType": "struct ISignatureTransfer.TokenPermissions",
            "name": "permitted",
            "type": "tuple"
        }, {"internalType": "uint256", "name": "nonce", "type": "uint256"}, {
            "internalType": "uint256",
            "name": "deadline",
            "type": "uint256"
        }], "internalType": "struct ISignatureTransfer.PermitTransferFrom", "name": "permit", "type": "tuple"
    }, {
        "components": [{"internalType": "address", "name": "to", "type": "address"}, {
            "internalType": "uint256",
            "name": "requestedAmount",
            "type": "uint256"
        }],
        "internalType": "struct ISignatureTransfer.SignatureTransferDetails",
        "name": "transferDetails",
        "type": "tuple"
    }, {"internalType": "address", "name": "owner", "type": "address"}, {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
    }], "name": "permitTransferFrom", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{
        "components": [{
            "components": [{
                "internalType": "address",
                "name": "token",
                "type": "address"
            }, {"internalType": "uint256", "name": "amount", "type": "uint256"}],
            "internalType": "struct ISignatureTransfer.TokenPermissions[]",
            "name": "permitted",
            "type": "tuple[]"
        }, {"internalType": "uint256", "name": "nonce", "type": "uint256"}, {
            "internalType": "uint256",
            "name": "deadline",
            "type": "uint256"
        }], "internalType": "struct ISignatureTransfer.PermitBatchTransferFrom", "name": "permit", "type": "tuple"
    }, {
        "components": [{"internalType": "address", "name": "to", "type": "address"}, {
            "internalType": "uint256",
            "name": "requestedAmount",
            "type": "uint256"
        }],
        "internalType": "struct ISignatureTransfer.SignatureTransferDetails[]",
        "name": "transferDetails",
        "type": "tuple[]"
    }, {"internalType": "address", "name": "owner", "type": "address"}, {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
    }], "name": "permitTransferFrom", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{
        "components": [{
            "components": [{
                "internalType": "address",
                "name": "token",
                "type": "address"
            }, {"internalType": "uint256", "name": "amount", "type": "uint256"}],
            "internalType": "struct ISignatureTransfer.TokenPermissions",
            "name": "permitted",
            "type": "tuple"
        }, {"internalType": "uint256", "name": "nonce", "type": "uint256"}, {
            "internalType": "uint256",
            "name": "deadline",
            "type": "uint256"
        }], "internalType": "struct ISignatureTransfer.PermitTransferFrom", "name": "permit", "type": "tuple"
    }, {
        "components": [{"internalType": "address", "name": "to", "type": "address"}, {
            "internalType": "uint256",
            "name": "requestedAmount",
            "type": "uint256"
        }],
        "internalType": "struct ISignatureTransfer.SignatureTransferDetails",
        "name": "transferDetails",
        "type": "tuple"
    }, {"internalType": "address", "name": "owner", "type": "address"}, {
        "internalType": "bytes32",
        "name": "witness",
        "type": "bytes32"
    }, {"internalType": "string", "name": "witnessTypeString", "type": "string"}, {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
    }], "name": "permitWitnessTransferFrom", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{
        "components": [{
            "components": [{
                "internalType": "address",
                "name": "token",
                "type": "address"
            }, {"internalType": "uint256", "name": "amount", "type": "uint256"}],
            "internalType": "struct ISignatureTransfer.TokenPermissions[]",
            "name": "permitted",
            "type": "tuple[]"
        }, {"internalType": "uint256", "name": "nonce", "type": "uint256"}, {
            "internalType": "uint256",
            "name": "deadline",
            "type": "uint256"
        }], "internalType": "struct ISignatureTransfer.PermitBatchTransferFrom", "name": "permit", "type": "tuple"
    }, {
        "components": [{"internalType": "address", "name": "to", "type": "address"}, {
            "internalType": "uint256",
            "name": "requestedAmount",
            "type": "uint256"
        }],
        "internalType": "struct ISignatureTransfer.SignatureTransferDetails[]",
        "name": "transferDetails",
        "type": "tuple[]"
    }, {"internalType": "address", "name": "owner", "type": "address"}, {
        "internalType": "bytes32",
        "name": "witness",
        "type": "bytes32"
    }, {"internalType": "string", "name": "witnessTypeString", "type": "string"}, {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
    }], "name": "permitWitnessTransferFrom", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{
        "components": [{
            "internalType": "address",
            "name": "from",
            "type": "address"
        }, {"internalType": "address", "name": "to", "type": "address"}, {
            "internalType": "uint160",
            "name": "amount",
            "type": "uint160"
        }, {"internalType": "address", "name": "token", "type": "address"}],
        "internalType": "struct IAllowanceTransfer.AllowanceTransferDetails[]",
        "name": "transferDetails",
        "type": "tuple[]"
    }], "name": "transferFrom", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "from", "type": "address"}, {
        "internalType": "address",
        "name": "to",
        "type": "address"
    }, {"internalType": "uint160", "name": "amount", "type": "uint160"}, {
        "internalType": "address",
        "name": "token",
        "type": "address"
    }], "name": "transferFrom", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}]


export const PERMIT2_BYTECODE = "0x" +
    "6040608081526004908136101561001557600080fd5b600090813560e01c8063" +
    "0d58b1db1461126c578063137c29fe146110755780632a2d80d114610db75780" +
    "632b67b57014610bde57806330f28b7a14610ade5780633644e51514610a9d57" +
    "806336c7851614610a285780633ff9dcb1146109a85780634fe02b441461093f" +
    "57806365d9723c146107ac57806387517c451461067a578063927da105146105" +
    "c3578063cc53287f146104a3578063edd9444b1461033a5763fe8ec1a7146100" +
    "c657600080fd5b346103365760c07fffffffffffffffffffffffffffffffffff" +
    "fffffffffffffffffffffffffffffc3601126103365767ffffffffffffffff83" +
    "3581811161033257610114903690860161164b565b60243582811161032e5761" +
    "012b903690870161161a565b6101336114e6565b9160843585811161032a5761" +
    "014b9036908a016115c1565b98909560a4359081116103265761016491369101" +
    "6115c1565b969095815190610173826113ff565b606b82527f5065726d697442" +
    "617463685769746e6573735472616e7366657246726f6d285460208301527f6f" +
    "6b656e5065726d697373696f6e735b5d207065726d69747465642c6164647283" +
    "8301527f657373207370656e6465722c75696e74323536206e6f6e63652c7569" +
    "6e74323560608301527f3620646561646c696e652c0000000000000000000000" +
    "00000000000000000000608083015282519a8b9181610222602085018096611f" +
    "93565b918237018a8152039961025b7fffffffffffffffffffffffffffffffff" +
    "ffffffffffffffffffffffffffffffe09b8c8101835282611437565b51902090" +
    "85515161026b81611ebb565b908a5b8181106102f95750506102f6999a6102ed" +
    "9183516102a081610294602082018095611f66565b0384810183528261143756" +
    "5b519020602089810151858b0151955191820196875260408201929092523360" +
    "60820152608081019190915260a081019390935260643560c08401528260e081" +
    "015b03908101835282611437565b51902093611cf7565b80f35b806103116103" +
    "0b610321938c5161175e565b51612054565b61031b828661175e565b52611f0a" +
    "565b61026e565b8880fd5b8780fd5b8480fd5b8380fd5b5080fd5b5091346103" +
    "365760807fffffffffffffffffffffffffffffffffffffffffffffffffffffff" +
    "fffffffffc3601126103365767ffffffffffffffff9080358281116103325761" +
    "038b903690830161164b565b60243583811161032e576103a290369084016116" +
    "1a565b9390926103ad6114e6565b9160643590811161049f576103c491369101" +
    "6115c1565b949093835151976103d489611ebb565b98885b81811061047d5750" +
    "506102f697988151610425816103f9602082018095611f66565b037fffffffff" +
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffe081018352" +
    "82611437565b5190206020860151828701519083519260208401947ffcf35f5a" +
    "c6a2c28868dc44c302166470266239195f02b0ee408334829333b76686528401" +
    "52336060840152608083015260a082015260a081526102ed8161141b565b808b" +
    "61031b8261049461030b61049a968d5161175e565b9261175e565b6103d7565b" +
    "8680fd5b5082346105bf57602090817fffffffffffffffffffffffffffffffff" +
    "fffffffffffffffffffffffffffffffc3601126103325780359067ffffffffff" +
    "ffffff821161032e576104f49136910161161a565b929091845b848110610504" +
    "578580f35b8061051a610515600193888861196c565b61197c565b61052f8461" +
    "0529848a8a61196c565b0161197c565b3389528385528589209173ffffffffff" +
    "ffffffffffffffffffffffffffffff80911692838b528652868a20911690818a" +
    "5285528589207fffffffffffffffffffffffff00000000000000000000000000" +
    "0000000000000081541690558551918252848201527f89b1add15eff56b3dfe2" +
    "99ad94e01f2b52fbcb80ae1a3baea6ae8c04cb2b98a4853392a2016104f9565b" +
    "8280fd5b50346103365760607fffffffffffffffffffffffffffffffffffffff" +
    "fffffffffffffffffffffffffc36011261033657610676816105ff6114a0565b" +
    "936106086114c3565b6106106114e6565b73ffffffffffffffffffffffffffff" +
    "ffffffffffff9687168352600160209081528484209288168452918252838320" +
    "90871683528152919020549251938316845260a083901c65ffffffffffff1690" +
    "84015260d09190911c604083015281906060820190565b0390f35b5034610336" +
    "5760807fffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +
    "fffffffc360112610336576106b26114a0565b906106bb6114c3565b916106c4" +
    "6114e6565b65ffffffffffff926064358481169081810361032a5779ffffffff" +
    "ffff0000000000000000000000000000000000000000947fda9fa7c1b00402c1" +
    "7d0161b249b1ab8bbec047c5a52207b9c112deffd817036b94338a5260016020" +
    "527fffffffffffff000000000000000000000000000000000000000000000000" +
    "0000858b209873ffffffffffffffffffffffffffffffffffffffff809416998a" +
    "8d5260205283878d209b169a8b8d52602052868c209486156000146107a45750" +
    "4216925b8454921697889360a01b169116171790558151938452602084015233" +
    "92a480f35b905092610783565b5082346105bf5760607fffffffffffffffffff" +
    "fffffffffffffffffffffffffffffffffffffffffffffc3601126105bf576107" +
    "e56114a0565b906107ee6114c3565b9265ffffffffffff604435818116939084" +
    "810361032a57338852602091600183528489209673ffffffffffffffffffffff" +
    "ffffffffffffffffff80911697888b528452858a20981697888a528352848920" +
    "5460d01c93848711156109175761ffff9085840316116108f05750907f55eb90" +
    "d810e1700b35a8e7e25395ff7f2b2259abd7415ca2284dfb1c246418f3939291" +
    "33895260018252838920878a528252838920888a5282528389209079ffffffff" +
    "ffffffffffffffffffffffffffffffffffffffffffff7fffffffffffff000000" +
    "000000000000000000000000000000000000000000000083549260d01b169116" +
    "17905582519485528401523392a480f35b84517f24d35a260000000000000000" +
    "00000000000000000000000000000000000000008152fd5b5084517f756688fe" +
    "000000000000000000000000000000000000000000000000000000008152fd5b" +
    "503461033657807fffffffffffffffffffffffffffffffffffffffffffffffff" +
    "fffffffffffffffc360112610336578060209273ffffffffffffffffffffffff" +
    "ffffffffffffffff61098f6114a0565b16815280845281812060243582528452" +
    "20549051908152f35b5082346105bf57817fffffffffffffffffffffffffffff" +
    "fffffffffffffffffffffffffffffffffffc3601126105bf577f3704902f9637" +
    "66a4e561bbaab6e6cdc1b1dd12f6e9e99648da8843b3f46b918d903591602435" +
    "3385528460205281852084865260205281852081815417905581519384526020" +
    "8401523392a280f35b8234610a9a5760807fffffffffffffffffffffffffffff" +
    "fffffffffffffffffffffffffffffffffffc360112610a9a57610a606114a056" +
    "5b610a686114c3565b610a706114e6565b6064359173ffffffffffffffffffff" +
    "ffffffffffffffffffff8316830361032e576102f6936117a1565b80fd5b5034" +
    "61033657817fffffffffffffffffffffffffffffffffffffffffffffffffffff" +
    "fffffffffffc36011261033657602090610ad7611b1e565b9051908152f35b50" +
    "8290346105bf576101007fffffffffffffffffffffffffffffffffffffffffff" +
    "fffffffffffffffffffffc3601126105bf57610b1a3661152a565b90807fffff" +
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7c3601" +
    "1261033257610b4c611478565b9160e43567ffffffffffffffff8111610bda57" +
    "6102f694610b6f913691016115c1565b939092610b7c8351612054565b602084" +
    "0151828501519083519260208401947f939c21a48a8dbe3a9a2404a1d46691e4" +
    "d39f6583d6ec6b35714604c986d8010686528401523360608401526080830152" +
    "60a082015260a08152610bd18161141b565b51902091611c25565b8580fd5b50" +
    "9134610336576101007fffffffffffffffffffffffffffffffffffffffffffff" +
    "fffffffffffffffffffc36011261033657610c186114a0565b7fffffffffffff" +
    "ffffffffffffffffffffffffffffffffffffffffffffffffffdc360160c08112" +
    "610332576080855191610c51836113e3565b1261033257845190610c62826113" +
    "98565b73ffffffffffffffffffffffffffffffffffffffff9160243583811681" +
    "0361049f578152604435838116810361049f57602082015265ffffffffffff60" +
    "6435818116810361032a5788830152608435908116810361049f576060820152" +
    "815260a435938285168503610bda576020820194855260c43590878301828152" +
    "60e43567ffffffffffffffff811161032657610cfe90369084016115c1565b92" +
    "9093804211610d88575050918591610d786102f6999a610d7e95610d23885161" +
    "1fbe565b90898c511690519083519260208401947ff3841cd1ff0085026a6327" +
    "b620b67997ce40f282c88a8e905a7a5626e310f3d08652840152606083015260" +
    "8082015260808152610d70816113ff565b519020611bd9565b916120c7565b51" +
    "9251169161199d565b602492508a51917fcd21db4f0000000000000000000000" +
    "00000000000000000000000000000000008352820152fd5b5091346103365760" +
    "607fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +
    "fffc93818536011261033257610df36114a0565b9260249081359267ffffffff" +
    "ffffffff9788851161032a578590853603011261049f57805197858901898110" +
    "8282111761104a57825284830135818111610326578501903660238301121561" +
    "0326578382013591610e50836115ef565b90610e5d85519283611437565b8382" +
    "52602093878584019160071b83010191368311611046578801905b828210610f" +
    "e9575050508a526044610e93868801611509565b96838c01978852013594838b" +
    "0191868352604435908111610fe557610ebb90369087016115c1565b95909680" +
    "4211610fba575050508998995151610ed681611ebb565b908b5b818110610f97" +
    "57505092889492610d7892610f6497958351610f02816103f98682018095611f" +
    "66565b5190209073ffffffffffffffffffffffffffffffffffffffff9a8b8b51" +
    "169151928551948501957faf1b0d30d2cab0380e68f0689007e3254993c596f2" +
    "fdd0aaa7f4d04f794408638752850152830152608082015260808152610d7081" +
    "6113ff565b51169082515192845b848110610f78578580f35b80610f91858561" +
    "0f8b600195875161175e565b5161199d565b01610f6d565b80610311610fac8e" +
    "9f9e93610fb2945161175e565b51611fbe565b9b9a9b610ed9565b8551917fcd" +
    "21db4f0000000000000000000000000000000000000000000000000000000083" +
    "52820152fd5b8a80fd5b60808236031261104657856080918851611002816113" +
    "98565b61100b85611509565b8152611018838601611509565b83820152611027" +
    "8a8601611607565b8a8201528d611037818701611607565b9082015281520191" +
    "0190610e7a565b8c80fd5b84896041867f4e487b710000000000000000000000" +
    "0000000000000000000000000000000000835252fd5b5082346105bf57610140" +
    "7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +
    "fc3601126105bf576110b03661152a565b91807fffffffffffffffffffffffff" +
    "ffffffffffffffffffffffffffffffffffffff7c360112610332576110e26114" +
    "78565b67ffffffffffffffff93906101043585811161049f5761110590369086" +
    "016115c1565b90936101243596871161032a57611125610bd1966102f6983691" +
    "016115c1565b969095825190611134826113ff565b606482527f5065726d6974" +
    "5769746e6573735472616e7366657246726f6d28546f6b656e5060208301527f" +
    "65726d697373696f6e73207065726d69747465642c6164647265737320737065" +
    "848301527f6e6465722c75696e74323536206e6f6e63652c75696e7432353620" +
    "646561646c60608301527f696e652c0000000000000000000000000000000000" +
    "000000000000000000000060808301528351948591816111e360208501809661" +
    "1f93565b918237018b8152039361121c7fffffffffffffffffffffffffffffff" +
    "ffffffffffffffffffffffffffffffffe095868101835282611437565b519020" +
    "9261122a8651612054565b602087810151858901519551918201968752604082" +
    "0192909252336060820152608081019190915260a081019390935260e43560c0" +
    "8401528260e081016102e1565b5082346105bf576020807fffffffffffffffff" +
    "fffffffffffffffffffffffffffffffffffffffffffffffc3601126103325781" +
    "3567ffffffffffffffff92838211610bda5736602383011215610bda57810135" +
    "92831161032e576024906007368386831b8401011161049f57865b8581106112" +
    "e5578780f35b80821b83019060807fffffffffffffffffffffffffffffffffff" +
    "ffffffffffffffffffffffffffffdc8336030112610326576113928887600194" +
    "6060835161132c81611398565b611368608461133c8d8601611509565b948584" +
    "5261134c60448201611509565b809785015261135d60648201611509565b8098" +
    "85015201611509565b918291015273ffffffffffffffffffffffffffffffffff" +
    "ffffff80808093169516931691166117a1565b016112da565b60808101908110" +
    "67ffffffffffffffff8211176113b457604052565b7f4e487b71000000000000" +
    "0000000000000000000000000000000000000000000060005260416004526024" +
    "6000fd5b6060810190811067ffffffffffffffff8211176113b457604052565b" +
    "60a0810190811067ffffffffffffffff8211176113b457604052565b60c08101" +
    "90811067ffffffffffffffff8211176113b457604052565b90601f7fffffffff" +
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffe091011681" +
    "0190811067ffffffffffffffff8211176113b457604052565b60c4359073ffff" +
    "ffffffffffffffffffffffffffffffffffff8216820361149b57565b600080fd" +
    "5b6004359073ffffffffffffffffffffffffffffffffffffffff821682036114" +
    "9b57565b6024359073ffffffffffffffffffffffffffffffffffffffff821682" +
    "0361149b57565b6044359073ffffffffffffffffffffffffffffffffffffffff" +
    "8216820361149b57565b359073ffffffffffffffffffffffffffffffffffffff" +
    "ff8216820361149b57565b7fffffffffffffffffffffffffffffffffffffffff" +
    "fffffffffffffffffffffffc01906080821261149b5760408051906115638261" +
    "13e3565b8082941261149b57805181810181811067ffffffffffffffff821117" +
    "6113b457825260043573ffffffffffffffffffffffffffffffffffffffff8116" +
    "810361149b578152602435602082015282526044356020830152606435910152" +
    "565b9181601f8401121561149b5782359167ffffffffffffffff831161149b57" +
    "6020838186019501011161149b57565b67ffffffffffffffff81116113b45760" +
    "051b60200190565b359065ffffffffffff8216820361149b57565b9181601f84" +
    "01121561149b5782359167ffffffffffffffff831161149b5760208085019484" +
    "60061b01011161149b57565b91909160608184031261149b5760408051916116" +
    "66836113e3565b8294813567ffffffffffffffff9081811161149b5783018260" +
    "1f8201121561149b578035611693816115ef565b926116a08751948561143756" +
    "5b818452602094858086019360061b8501019381851161149b57908689989796" +
    "9594939201925b8484106116e357505050505085528082013590850152013591" +
    "0152565b90919293949596978483031261149b57885190898201908282108583" +
    "1117611730578a928992845261171487611509565b8152828701358382015281" +
    "5201930191908897969594936116c6565b602460007f4e487b71000000000000" +
    "0000000000000000000000000000000000000000000081526041600452fd5b80" +
    "518210156117725760209160051b010190565b7f4e487b710000000000000000" +
    "0000000000000000000000000000000000000000600052603260045260246000" +
    "fd5b92919273ffffffffffffffffffffffffffffffffffffffff604060008284" +
    "1681526001602052828282209616958682526020528181203382526020522094" +
    "85549565ffffffffffff8760a01c168042116118845750828716968388036118" +
    "12575b5050611810955016926118b5565b565b878484161160001461184f5760" +
    "2488604051907ff96fb071000000000000000000000000000000000000000000" +
    "0000000000000082526004820152fd5b7fffffffffffffffffffffffff000000" +
    "000000000000000000000000000000000084846118109a031691161790553880" +
    "611802565b602490604051907fd81b2f2e000000000000000000000000000000" +
    "0000000000000000000000000082526004820152fd5b90600060649260209582" +
    "95604051947f23b872dd00000000000000000000000000000000000000000000" +
    "00000000000086526004860152602485015260448401525af13d15601f3d1160" +
    "01600051141617161561190e57565b60646040517f08c379a000000000000000" +
    "0000000000000000000000000000000000000000008152602060048201526014" +
    "60248201527f5452414e534645525f46524f4d5f4641494c4544000000000000" +
    "0000000000006044820152fd5b91908110156117725760061b0190565b3573ff" +
    "ffffffffffffffffffffffffffffffffffffff8116810361149b5790565b9065" +
    "ffffffffffff908160608401511673ffffffffffffffffffffffffffffffffff" +
    "ffffff9081855116948260208201511692808660408094015116951695600091" +
    "8783526001602052838320898452602052838320991698898352602052828220" +
    "9184835460d01c03611af5579185611ace94927fc6a377bfc4eb120024a8ac08" +
    "eef205be16b817020812c73223e81d1bdb9708ec98979694508715600014611a" +
    "d35779ffffffffffff0000000000000000000000000000000000000000904216" +
    "5b60a01b167fffffffffffff0000000000000000000000000000000000000000" +
    "0000000000006001860160d01b1617179055519384938491604091949373ffff" +
    "ffffffffffffffffffffffffffffffffffff606085019616845265ffffffffff" +
    "ff809216602085015216910152565b0390a4565b5079ffffffffffff00000000" +
    "0000000000000000000000000000000087611a60565b600484517f756688fe00" +
    "0000000000000000000000000000000000000000000000000000008152fd5b46" +
    "7f00000000000000000000000000000000000000000000000000000000000000" +
    "0103611b69577f866a5aba21966af95d6c7ab78eb2b2fc913915c28be3b9aa07" +
    "cc04ff903e3f2890565b60405160208101907f8cad95687ba82c2ce50e74f7b7" +
    "54645e5117c3a5bec8151c0726d5857980a86682527f9ac997416e8ff9d2ff6b" +
    "ebeb7149f65cdae5e32e2b90440b566bb3044041d36a60408201524660608201" +
    "5230608082015260808152611bd3816113ff565b51902090565b611be1611b1e" +
    "565b906040519060208201927f19010000000000000000000000000000000000" +
    "0000000000000000000000000084526022830152604282015260428152611bd3" +
    "81611398565b9192909360a435936040840151804211611cc657506020845101" +
    "51808611611c955750918591610d78611c6594611c60602088015186611e4756" +
    "5b611bd9565b73ffffffffffffffffffffffffffffffffffffffff8091515116" +
    "92608435918216820361149b57611810936118b5565b602490604051907f3728" +
    "b83d000000000000000000000000000000000000000000000000000000008252" +
    "6004820152fd5b602490604051907fcd21db4f00000000000000000000000000" +
    "00000000000000000000000000000082526004820152fd5b9590939580515195" +
    "60409283830151804211611e175750848803611dee57611d2e918691610d7860" +
    "209b611c608d88015186611e47565b60005b868110611d425750505050505050" +
    "50565b611d4d81835161175e565b5188611d5a83878a61196c565b0135908981" +
    "0151808311611dbe575091818888886001968596611d84575b50505050505001" +
    "611d31565b611db395611dad9273ffffffffffffffffffffffffffffffffffff" +
    "ffff6105159351169561196c565b916118b5565b803888888883611d78565b60" +
    "24908651907f3728b83d00000000000000000000000000000000000000000000" +
    "00000000000082526004820152fd5b600484517fff633a380000000000000000" +
    "00000000000000000000000000000000000000008152fd5b6024908551907fcd" +
    "21db4f0000000000000000000000000000000000000000000000000000000082" +
    "526004820152fd5b9073ffffffffffffffffffffffffffffffffffffffff6001" +
    "60ff83161b9216600052600060205260406000209060081c6000526020526040" +
    "600020818154188091551615611e9157565b60046040517f756688fe00000000" +
    "0000000000000000000000000000000000000000000000008152fd5b90611ec5" +
    "826115ef565b611ed26040519182611437565b8281527fffffffffffffffffff" +
    "ffffffffffffffffffffffffffffffffffffffffffffe0611f0082946115ef56" +
    "5b0190602036910137565b7fffffffffffffffffffffffffffffffffffffffff" +
    "ffffffffffffffffffffffff8114611f375760010190565b7f4e487b71000000" +
    "0000000000000000000000000000000000000000000000000060005260116004" +
    "5260246000fd5b805160208092019160005b828110611f7f575050505090565b" +
    "835185529381019392810192600101611f71565b9081519160005b838110611f" +
    "ab575050016000815290565b8060208092840101518185015201611f9a565b60" +
    "405160208101917f65626cad6cb96493bf6f5ebea28756c966f023ab9e8a83a7" +
    "101849d5573b3678835273ffffffffffffffffffffffffffffffffffffffff80" +
    "82511660408401526020820151166060830152606065ffffffffffff91826040" +
    "82015116608085015201511660a082015260a0815260c0810181811067ffffff" +
    "ffffffffff8211176113b45760405251902090565b6040516020808201927f61" +
    "8358ac3db8dc274f0cd8829da7e234bd48cd73c4a740aede1adec9846d06a184" +
    "5273ffffffffffffffffffffffffffffffffffffffff81511660408401520151" +
    "606082015260608152611bd381611398565b919082604091031261149b576020" +
    "823592013590565b6000843b61222e5750604182036121ac576120e482820182" +
    "6120b1565b939092604010156117725760209360009360ff6040608095013560" +
    "f81c5b60405194855216868401526040830152606082015282805260015afa15" +
    "6121a05773ffffffffffffffffffffffffffffffffffffffff80600051169182" +
    "1561217657160361214c57565b60046040517f815e1d64000000000000000000" +
    "000000000000000000000000000000000000008152fd5b60046040517f8baa57" +
    "9f000000000000000000000000000000000000000000000000000000008152fd" +
    "5b6040513d6000823e3d90fd5b60408203612204576121c0918101906120b156" +
    "5b91601b7f7fffffffffffffffffffffffffffffffffffffffffffffffffffff" +
    "ffffffffff84169360ff1c019060ff8211611f375760209360009360ff608094" +
    "612102565b60046040517f4be6321b0000000000000000000000000000000000" +
    "00000000000000000000008152fd5b929391601f928173ffffffffffffffffff" +
    "ffffffffffffffffffffff60646020957fffffffffffffffffffffffffffffff" +
    "ffffffffffffffffffffffffffffffffe0604051988997889687947f1626ba7e" +
    "000000000000000000000000000000000000000000000000000000009e8f8752" +
    "600487015260406024870152816044870152868601378b858286010152011681" +
    "01030192165afa9081156123a857829161232a575b507fffffffff0000000000" +
    "0000000000000000000000000000000000000000000000915016036123005756" +
    "5b60046040517fb0669cbc000000000000000000000000000000000000000000" +
    "000000000000008152fd5b90506020813d82116123a0575b8161234460209383" +
    "611437565b810103126103365751907fffffffff000000000000000000000000" +
    "0000000000000000000000000000000082168203610a9a57507fffffffff0000" +
    "000000000000000000000000000000000000000000000000000090386122d456" +
    "5b3d9150612337565b6040513d84823e3d90fdfea164736f6c6343000811000a"
