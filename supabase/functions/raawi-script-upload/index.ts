/**
 * Edge Function: raawi-script-upload
 * Handles script document uploads (PDF/DOCX)
 * POST /raawi-script-upload with multipart/form-data
 * Fields: file, scriptId, companyId
 */
import { optionsResponse, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "scripts";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

Deno.serve(async (req: Request) => {
    const origin = req.headers.get("origin") ?? undefined;
    const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });

    if (req.method === "OPTIONS") return optionsResponse(req);

    // STEP:auth_parse - Check headers
    const authHeader = req.headers.get("Authorization");
    console.log(`[raawi-script-upload] STEP:auth_parse - Auth header exists: ${!!authHeader}`);

    if (!authHeader) {
        return json({ code: 401, message: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    console.log(`[raawi-script-upload] STEP:auth_parse - Token len: ${token.length}, Prefix: ${token.substring(0, 10)}...`);

    if (!token) {
        return json({ code: 401, message: "Invalid JWT (empty)" }, 401);
    }

    // STEP:auth_verify - Verify with Supabase Client (Standard Pattern)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create client representing the user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false }
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
        console.error("[raawi-script-upload] STEP:auth_verify FAILED:", authError);
        return json({ code: 401, message: "Invalid JWT (expired or bad signature)" }, 401);
    }

    console.log(`[raawi-script-upload] STEP:auth_verify SUCCESS - User ID: ${user.id}`);

    // Use Admin client for privileged storage operations
    const supabase = createSupabaseAdmin();

    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
    }

    let formData: FormData;
    try {
        formData = await req.formData();
    } catch (error) {
        console.error("[raawi-script-upload] formData parse error:", error);
        return json({ error: "Invalid form data" }, 400);
    }

    const file = formData.get("file") as File | null;
    const scriptId = formData.get("scriptId") as string | null;
    const companyId = formData.get("companyId") as string | null;

    if (!file) {
        return json({ error: "file is required" }, 400);
    }

    if (!scriptId) {
        return json({ error: "scriptId is required" }, 400);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        return json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` }, 400);
    }

    // Validate file type
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['pdf', 'docx', 'doc'].includes(ext)) {
        return json({ error: "Only PDF and DOCX files are supported" }, 400);
    }

    // Create storage path: {companyId}/{scriptId}/{timestamp}_{filename}
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = companyId
        ? `${companyId}/${scriptId}/${timestamp}_${sanitizedFilename}`
        : `${scriptId}/${timestamp}_${sanitizedFilename}`;

    // Upload to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, {
            contentType: file.type,
            upsert: false,
        });

    if (uploadError) {
        console.error("[raawi-script-upload] storage upload error:", uploadError);
        return json({ error: uploadError.message || "Failed to upload file" }, 500);
    }

    // Use relative path for database storage (bucket/path)
    const fileUrl = `${BUCKET}/${storagePath}`;

    // Update script record with relative file path
    const { error: updateError } = await supabase
        .from("scripts")
        .update({ file_url: fileUrl })
        .eq("id", scriptId);

    if (updateError) {
        console.error("[raawi-script-upload] script update error:", updateError);
        // Don't fail the upload, just log the error
    }

    // Create ScriptVersion record
    const sourceFileType = file.type || (ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    // Get next version number
    const { data: maxRow } = await supabase
        .from("script_versions")
        .select("version_number")
        .eq("script_id", scriptId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

    const nextVersion = maxRow ? (maxRow as { version_number: number }).version_number + 1 : 1;

    // Create version with "extracting" status
    const { data: version, error: versionError } = await supabase
        .from("script_versions")
        .insert({
            script_id: scriptId,
            version_number: nextVersion,
            source_file_name: file.name,
            source_file_type: sourceFileType,
            source_file_size: file.size,
            source_file_path: storagePath,
            source_file_url: fileUrl,
            extraction_status: "extracting"
        })
        .select("id, version_number")
        .single();

    if (versionError || !version) {
        console.error("[raawi-script-upload] version creation error:", versionError);
        return json({ error: "Failed to create version" }, 500);
    }

    console.log(`[raawi-script-upload] Created version ${version.id} for script ${scriptId}`);

    // Update script's current_version_id
    await supabase
        .from("scripts")
        .update({ current_version_id: version.id })
        .eq("id", scriptId);

    // Trigger async extraction (fire-and-forget)
    const extractUrl = `${req.url.replace('/raawi-script-upload', '/extract')}`;
    console.log(`[raawi-script-upload] Triggering extraction at ${extractUrl}`);

    fetch(extractUrl, {
        method: 'POST',
        headers: {
            'Authorization': req.headers.get('Authorization') || '',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            versionId: version.id,
            scriptId: scriptId,
            storagePath: storagePath,
            fileType: ext,
        }),
    }).catch(err => {
        console.error("[raawi-script-upload] Failed to trigger extraction:", err);
        // Don't fail the upload - extraction can be retried manually
    });

    return json({
        success: true,
        fileUrl,
        path: storagePath,
        fileName: file.name,
        fileSize: file.size,
        versionId: version.id,
        versionNumber: version.version_number,
    });
});
