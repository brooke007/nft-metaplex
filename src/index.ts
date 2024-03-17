import { initializeKeypair } from "./initializeKeypair"
import { Connection, clusterApiUrl, PublicKey, Signer, Transaction } from "@solana/web3.js"
import {
  Metaplex,
  keypairIdentity,
  bundlrStorage,
  toMetaplexFile,
  NftWithToken,
} from "@metaplex-foundation/js"
import * as fs from "fs"
import { u32 } from "@coral-xyz/borsh"
import express, { Request, Response } from 'express';
// 导入你的 TypeScript 文件，确保你的 main 函数已经被正确导出


const app = express();
const port = 53378;

app.use(express.json());

app.post('/start-main-function', (req: Request, res: Response) => {
  main().then(() => {
    console.log(`he`);
    res.json({ message: "NFT创建流程已成功启动" });
  }).catch((error) => {
    console.error("后端发生错误:", error);
    res.status(500).json({ message: "执行过程中发生错误" });
  });
});

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});



interface ImageInfo {
  id: number;
  url: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

interface NftData {
  name: string
  symbol: string
  description: string
  sellerFeeBasisPoints: number
  imageFile: string
}

interface CollectionNftData {
  name: string
  symbol: string
  description: string
  sellerFeeBasisPoints: number
  imageFile: string
  isCollection: boolean
  collectionAuthority: Signer
}

// example data for a new NFT
const nftData = {
  name: "Name",
  symbol: "SYMBOL",
  description: "Description",
  sellerFeeBasisPoints: 0,
  imageFile: "pink.png",
}

// 定义一个关键帧类型，它是ImageInfo的数组
type Keyframe = ImageInfo[];

// 定义KeyframesData为Keyframe的数组
type KeyframesData = Keyframe[];

// 新增的从文件读取KeyframesData的函数
async function getKeyframesDataFromFile(filePath: string): Promise<KeyframesData> {
  try {
    const data = fs.readFileSync(filePath, { encoding: "utf-8" });
    return JSON.parse(data);
  } catch (error) {
    console.error("Failed to read keyframes data from file:", error);
    // 如果发生错误，返回一个空数组或者抛出错误
    // 这里返回一个空数组作为失败时的安全默认值
    return [];
  }
}

// example data for updating an existing NFT
let x:number,y:number,ro:number,s:number,set:number;
// 需要将前端的数据读取到这里
async function uploadMetadata(
  metaplex: Metaplex,
  nftData: NftData,
  keyframesData: KeyframesData
): Promise<string> {
  // file to buffer
  //const buffer = fs.readFileSync("src/" + nftData.imageFile)
  const buffer = fs.readFileSync(nftData.imageFile)

  // buffer to metaplex file
  const file = toMetaplexFile(buffer, nftData.imageFile)

  // upload image and get image uri
  const imageUri = await metaplex.storage().upload(file)
  console.log("image uri:", imageUri)

  const attributes = keyframesData.flatMap((keyframe, keyframeIndex) => 
    keyframe.map(imageInfo => ({
      trait_type: `Image ${imageInfo.id} Keyframe ${keyframeIndex}`,
      value: JSON.stringify({ x: imageInfo.x, y: imageInfo.y, rotation: imageInfo.rotation, scale: imageInfo.scale })
    }))
  );

  // upload metadata and get metadata uri (off chain metadata)
  const { uri } = await metaplex.nfts().uploadMetadata({
    name: nftData.name,
    symbol: nftData.symbol,
    description: nftData.description,
    image: imageUri,
    attributes, // 使用构建的属性数组
  });

  console.log("metadata uri:", uri)
  return uri
}

async function createNft(
  metaplex: Metaplex,
  uri: string,
  nftData: NftData,
  collectionMint: PublicKey
): Promise<NftWithToken> {
  const { nft } = await metaplex.nfts().create(
    {
      uri: uri, // metadata URI
      name: nftData.name,
      sellerFeeBasisPoints: nftData.sellerFeeBasisPoints,
      symbol: nftData.symbol,
      collection: collectionMint,
    },
    { commitment: "finalized" }
  )

  console.log(
    `Token Mint: https://explorer.solana.com/address/${nft.address.toString()}?cluster=devnet`
  );

  await metaplex.nfts().verifyCollection({
    //this is what verifies our collection as a Certified Collection
    mintAddress: nft.mint.address,
    collectionMintAddress: collectionMint,
    isSizedCollection: true,
  })

  return nft
}

async function createCollectionNft(
  metaplex: Metaplex,
  uri: string,
  data: CollectionNftData
): Promise<NftWithToken> {
  const { nft } = await metaplex.nfts().create(
    {
      uri: uri,
      name: data.name,
      sellerFeeBasisPoints: data.sellerFeeBasisPoints,
      symbol: data.symbol,
      isCollection: true,
    },
    { commitment: "finalized" }
  )

  console.log(
    `Collection Mint: https://explorer.solana.com/address/${nft.address.toString()}?cluster=devnet`
  )

  return nft
}

// helper function update NFT
async function updateNftUri(
  metaplex: Metaplex,
  uri: string,
  mintAddress: PublicKey
) {
  // fetch NFT data using mint address
  const nft = await metaplex.nfts().findByMint({ mintAddress })

  // update the NFT metadata
  const { response } = await metaplex.nfts().update(
    {
      nftOrSft: nft,
      uri: uri,
    },
    { commitment: "finalized" }
  )

  console.log(
    `Token Mint: https://explorer.solana.com/address/${nft.address.toString()}?cluster=devnet`
  )

  console.log(
    `Transaction: https://explorer.solana.com/tx/${response.signature}?cluster=devnet`
  )
}

export async function main() {
  // create a new connection to the cluster's API
  const connection = new Connection("https://devnet.helius-rpc.com/?api-key=f46e7c57-a4d4-43b0-b65b-1f287e2380cb")

  // initialize a keypair for the user
  const user = await initializeKeypair(connection)

  console.log("PublicKey:", user.publicKey.toBase58())

  // metaplex set up
  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(user))
    .use(
      bundlrStorage({
        address: "https://devnet.bundlr.network",
        providerUrl: "https://devnet.helius-rpc.com/?api-key=f46e7c57-a4d4-43b0-b65b-1f287e2380cb",
        timeout: 60000,
      })
    )

  const collectionNftData:CollectionNftData = {
    name: "TestCollectionNFT",
    symbol: "TEST",
    description: "Test Description Collection",
    sellerFeeBasisPoints: 100,
    imageFile: "pink.png",
    isCollection: true,
    collectionAuthority: user,
  }
  // 从all-keyframes.json文件读取KeyframesData
  const keyframesDataFilePath = "../../../../all-keyframes.json"; // 根据文件实际位置调整路径
  const keyframesData = await getKeyframesDataFromFile(keyframesDataFilePath);


// 在if语句之外定义keyframesData变量，确保它在整个作用域内都可访问


  // upload data for the collection NFT and get the URI for the metadata
  //const collectionUri = await uploadMetadata(metaplex, collectionNftData, x, y, ro, s, lo, set)
  const collectionUri = await uploadMetadata(metaplex, collectionNftData,keyframesData ?? [])
  // create a collection NFT using the helper function and the URI from the metadata
  const collectionNft = await createCollectionNft(
    metaplex,
    collectionUri,
    collectionNftData
  )

  // upload the NFT data and get the URI for the metadata
  //const uri = await uploadMetadata(metaplex, nftData,  x, y, ro, s, lo, set)
  const uri = await uploadMetadata(metaplex, nftData,  keyframesData ?? [])
  // create an NFT using the helper function and the URI from the metadata
  const nft = await createNft(
    metaplex,
    uri,
    nftData,
    collectionNft.mint.address
  )

  // upload updated NFT data and get the new URI for the metadata
  //const updatedUri = await uploadMetadata(metaplex, updateNftData)

  // update the NFT using the helper function and the new URI from the metadata
  // await updateNftUri(metaplex, updatedUri, nft.address)
}

// main()
//   .then(() => {
//     console.log("Finished successfully")
//     process.exit(0)
//   })
//   .catch((error) => {
//     console.log(error)
//     process.exit(1)
//   })