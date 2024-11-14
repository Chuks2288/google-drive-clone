"use server";

import { createAdminClient, createSessionClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { Query, ID } from "node-appwrite";
import { parseStringify } from "@/lib/utils";
import { cookies } from "next/headers";
// import { avatarPlaceholderUrl } from "@/constants";
import { redirect } from "next/navigation";

const getUserByEmail = async (email: string) => {
    const { databases } = await createAdminClient();

    const result = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.usersCollectionId,
        [Query.equal("email", [email])],
    );

    return result.total > 0 ? result.documents[0] : null;
};

const handleError = (error: unknown, message: string) => {
    console.log(error, message);
    throw error;
};

export const sendEmailOTP = async ({ email }: { email: string }) => {
    const { account } = await createAdminClient();

    try {
        const session = await account.createEmailToken(ID.unique(), email);

        return session.userId;
    } catch (error) {
        handleError(error, "Failed to send email OTP");
    }
};

export const createAccount = async ({
    fullName,
    email,
}: {
    fullName: string;
    email: string;
}) => {
    const existingUser = await getUserByEmail(email);

    const accountId = await sendEmailOTP({ email });
    if (!accountId) throw new Error("Failed to send an OTP");

    if (!existingUser) {
        const { databases } = await createAdminClient();

        await databases.createDocument(
            appwriteConfig.databaseId,
            appwriteConfig.usersCollectionId,
            ID.unique(),
            {
                fullName,
                email,
                // avatar: avatarPlaceholderUrl,
                avatar: "https://www.google.com/url?sa=i&url=https%3A%2F%2Fpngtree.com%2Ffreepng%2Favatar-placeholder-abstract-white-blue-green_6796235.html&psig=AOvVaw3Exh2AgScPjCM0lwVXI836&ust=1731663630985000&source=images&cd=vfe&opi=89978449&ved=0CBEQjRxqFwoTCKDAgfPD24kDFQAAAAAdAAAAABAG",
                accountId,
            },
        );
    }

    return parseStringify({ accountId });
};

export const verifySecret = async ({
    accountId,
    password,
}: {
    accountId: string;
    password: string;
}) => {
    try {
        const { account } = await createAdminClient();

        const session = await account.createSession(accountId, password);

        (await cookies()).set("appwrite-session", session.secret, {
            path: "/",
            httpOnly: true,
            sameSite: "strict",
            secure: true,
        });

        return parseStringify({ sessionId: session.$id });
    } catch (error) {
        handleError(error, "Failed to verify OTP");
    }
};

export const getCurrentUser = async () => {
    try {
        const { databases, account } = await createSessionClient();

        const result = await account.get();

        const user = await databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.usersCollectionId,
            [Query.equal("accountId", result.$id)],
        );

        if (user.total <= 0) return null;

        return parseStringify(user.documents[0]);
    } catch (error) {
        console.log(error);
    }
};

export const signOutUser = async () => {
    const { account } = await createSessionClient();

    try {
        await account.deleteSession("current");
        (await cookies()).delete("appwrite-session");
    } catch (error) {
        handleError(error, "Failed to sign out user");
    } finally {
        redirect("/sign-in");
    }
};

export const signInUser = async ({ email }: { email: string }) => {
    try {
        const existingUser = await getUserByEmail(email);

        // User exists, send OTP
        if (existingUser) {
            await sendEmailOTP({ email });
            return parseStringify({ accountId: existingUser.accountId });
        }

        return parseStringify({ accountId: null, error: "User not found" });
    } catch (error) {
        handleError(error, "Failed to sign in user");
    }
};