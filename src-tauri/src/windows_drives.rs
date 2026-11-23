use crate::models::DriveInfo;

#[cfg(windows)]
pub fn list_drives() -> Vec<DriveInfo> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Storage::FileSystem::{
        GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW,
    };

    const DRIVE_REMOVABLE: u32 = 2;
    const DRIVE_FIXED: u32 = 3;

    let mut drives = Vec::new();
    let bitmask = unsafe { GetLogicalDrives() };

    for i in 0..26 {
        if (bitmask & (1 << i)) != 0 {
            let drive_letter = (b'A' + i) as char;
            let root_path_str = format!("{}:\\", drive_letter);
            let wide_path: Vec<u16> = root_path_str.encode_utf16().chain(std::iter::once(0)).collect();

            let drive_type = unsafe { GetDriveTypeW(wide_path.as_ptr()) };
            if drive_type != DRIVE_FIXED && drive_type != DRIVE_REMOVABLE {
                continue;
            }

            let mut volume_name_buf = [0u16; 260];
            let mut fs_name_buf = [0u16; 260];
            let mut serial_number = 0u32;
            let mut max_component_len = 0u32;
            let mut fs_flags = 0u32;

            let success = unsafe {
                GetVolumeInformationW(
                    wide_path.as_ptr(),
                    volume_name_buf.as_mut_ptr(),
                    volume_name_buf.len() as u32,
                    &mut serial_number,
                    &mut max_component_len,
                    &mut fs_flags,
                    fs_name_buf.as_mut_ptr(),
                    fs_name_buf.len() as u32,
                )
            };

            let volume_name = if success != 0 {
                let len = volume_name_buf.iter().position(|&c| c == 0).unwrap_or(0);
                OsString::from_wide(&volume_name_buf[..len]).to_string_lossy().to_string()
            } else {
                "Local Disk".to_string()
            };

            let fs_type = if success != 0 {
                let len = fs_name_buf.iter().position(|&c| c == 0).unwrap_or(0);
                OsString::from_wide(&fs_name_buf[..len]).to_string_lossy().to_string()
            } else {
                "NTFS".to_string()
            };

            let mut free_bytes_available = 0u64;
            let mut total_bytes = 0u64;
            let mut total_free_bytes = 0u64;

            let space_success = unsafe {
                GetDiskFreeSpaceExW(
                    wide_path.as_ptr(),
                    &mut free_bytes_available,
                    &mut total_bytes,
                    &mut total_free_bytes,
                )
            };

            if space_success != 0 && total_bytes > 0 {
                let used_bytes = total_bytes.saturating_sub(total_free_bytes);
                let percent_used = (used_bytes as f64 / total_bytes as f64) * 100.0;

                drives.push(DriveInfo {
                    mount_point: root_path_str,
                    volume_name: if volume_name.is_empty() {
                        format!("Local Disk ({}:)", drive_letter)
                    } else {
                        volume_name
                    },
                    fs_type,
                    total_bytes,
                    free_bytes: total_free_bytes,
                    used_bytes,
                    percent_used,
                });
            }
        }
    }

    drives
}

#[cfg(not(windows))]
pub fn list_drives() -> Vec<DriveInfo> {
    vec![DriveInfo {
        mount_point: "/".to_string(),
        volume_name: "Root".to_string(),
        fs_type: "ext4".to_string(),
        total_bytes: 500_000_000_000,
        free_bytes: 200_000_000_000,
        used_bytes: 300_000_000_000,
        percent_used: 60.0,
    }]
}
