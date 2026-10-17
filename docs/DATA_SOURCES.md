# Source: NVIDIA Physical AI Smart Spaces (retail scenes)

| | |
|---|---|
| **Dataset** | Physical AI Smart Spaces (originally the AI City Challenge 2024, Track 1: multi-camera people tracking) |
| **Publisher** | NVIDIA |
| **Homepage** | https://huggingface.co/datasets/nvidia/PhysicalAI-SmartSpaces |
| **Path within the dataset** | `MTMC_Tracking_2024/test/scene_071` … `scene_080` |
| **Dataset revision** | `2cbe9563cbe9f47f846e5c871ee994572bbbc60e` (last modified 2026-10-05) |
| **Licence** | **Creative Commons Attribution 4.0 International (CC BY 4.0)**: https://creativecommons.org/licenses/by/4.0/ |
| **Commercial use** | Allowed under CC BY 4.0, with attribution |
| **Real or synthetic** | **Synthetic.** Rendered with NVIDIA Omniverse and IsaacSim, with labels generated automatically. No real people appear. |
| **Downloaded** | 2026-10-15, by Tom Vardy, from the Hugging Face `resolve/main` URLs. File sizes were checked against the Hugging Face API. |

## What was downloaded

The NVIDIA README says scenes 071–080 share one retail layout:
"In the sequences ranging from scenes 071 to 080, you'll find a storage room distinct
from the primary retail space. Although separate, individuals can access this area."

Each scene folder contains:

- `camera_XXXX/video.mp4`: 1080p, 30 fps, H.264, about 13 min. All cameras in a scene are time-synchronised.
- `camera_XXXX/calibration.json`: the camera matrix and a homography that maps the image to floor coordinates.
- `calibration_2025_format.json`: calibration for every camera in the newer JSON format.
- `ground_truth.txt`: in MOTChallenge style, `<camera_id> <obj_id> <frame_id> <xmin> <ymin> <width> <height> <xworld> <yworld>`
- `ground_truth_2025_format.json`: per-frame 3D location, 3D box and per-camera 2D boxes.

Known issue, from the NVIDIA README: "the video identified as `scene_071/camera_0649`
has encountered corruption issues." It was not downloaded.

## Attribution to use

> Footage: NVIDIA Physical AI Smart Spaces dataset
> (https://huggingface.co/datasets/nvidia/PhysicalAI-SmartSpaces), licensed under CC BY 4.0.

## Citation (verbatim from the dataset README)

Please cite the following papers when using this dataset:

```bibtex
@InProceedings{Wang26PAISS,
author = {Yuxing Wang and Yizhou Wang and Anqi Li and Shuo Wang and Sameer Satish Pusegaonkar and Haoquan Liang and Jiajun Li and Shenxin Jiang and Jianhe Yuan and Shangru Li and Tongwei Dai and Zihao Chen and David C. Anastasiu and Sujit Biswas and Xunlei Wu and Zheng Tang},
title = {Physical {AI} {S}mart {S}paces: {A} large-scale benchmark for multi-camera {3D} perception in smart spaces},
booktitle = {Proc. NeurIPS},
address = {Atlanta, GA, USA},
note = {arXiv:2610.02580},
year = {2026}
}

@misc{Wang26Unified3DPerception,
author = {Yizhou Wang and Sameer Pusegaonkar and Yuxing Wang and Anqi Li and Vishal Kumar and Chetan Sethi and Ganapathy Aiyer and Yun He and Kartikay Thakkar and Swapnil Rathi and Bhushan Rupde and Zheng Tang and Sujit Biswas},
title = {A unified {3D} object perception framework for real-time outside-in multi-camera systems},
note = {arXiv:2601.10819},
year = {2026}
}

@InProceedings{Tang26AICity26,
author = {Zheng Tang and Shuo Wang and David C. Anastasiu and Ming-Ching Chang and Anuj Sharma and Quan Kong and Munkhjargal Gochoo and Jun-Wei Hsieh and Tomasz Kornuta and Zhedong Zheng and Renran Tian and Judah Goldfeder and Fulgencio Navarro and Yuxing Wang and Yizhou Wang and Sameer Satish Pusegaonkar and Anqi Li and Nalin Dadhich and Ridham Kachhadiya and Dhanishtha Patil and Haoquan Liang and Jiajun Li and Han Zhang and Yilin Zhao and Zaid Pervaiz Bhat and Shuyu Yang and Ashutosh Kumar and Rong Wang and Rafael Martin Nieto and Peter Christiansen and Ahmed Abduljawad and Mohanrasu Shanmugam and Nadeem Shaik and Sujit Biswas and Xunlei Wu and Vidya Murali and Rama Chellappa},
title = {The 10th {AI} {C}ity {C}hallenge},
booktitle = {Proc. ECCV Workshops},
address = {Malm\"o, Sweden},
year = {2026}
}

@InProceedings{Tang25AICity25,
author = {Zheng Tang and Shuo Wang and David C. Anastasiu and Ming-Ching Chang and Anuj Sharma and Quan Kong and Norimasa Kobori and Munkhjargal Gochoo and Ganzorig Batnasan and Munkh-Erdene Otgonbold and Fady Alnajjar and Jun-Wei Hsieh and Tomasz Kornuta and Xiaolong Li and Yilin Zhao and Han Zhang and Subhashree Radhakrishnan and Arihant Jain and Ratnesh Kumar and Vidya N. Murali and Yuxing Wang and Sameer Satish Pusegaonkar and Yizhou Wang and Sujit Biswas and Xunlei Wu and Zhedong Zheng and Pranamesh Chakraborty and Rama Chellappa},
title = {The 9th {AI} {C}ity {C}hallenge},
booktitle = {Proc. ICCV Workshops},
pages = {5526–-5535},
address = {Honolulu, HI, USA},
year = {2025}
}

@inproceedings{Wang24AICity24,
author = {Shuo Wang and David C. Anastasiu and Zheng Tang and Ming-Ching Chang and Yue Yao and Liang Zheng and Mohammed Shaiqur Rahman and Meenakshi S. Arya and Anuj Sharma and Pranamesh Chakraborty and Sanjita Prajapati and Quan Kong and Norimasa Kobori and Munkhjargal Gochoo and Munkh-Erdene Otgonbold and Ganzorig Batnasan and Fady Alnajjar and Ping-Yang Chen and Jun-Wei Hsieh and Xunlei Wu and Sameer Satish Pusegaonkar and Yizhou Wang and Sujit Biswas and Rama Chellappa},
title = {The 8th {AI} {C}ity {C}hallenge},
booktitle = {Proc. CVPR Workshops},
pages = {7261--7272},
address = {Seattle, WA, USA},
year = {2024}
}
```
