"use client";

import React, { useState, useMemo } from "react";
import CreatableSelect from "react-select/creatable";
import { MultiValue, StylesConfig } from "react-select";
import { uniqueSkills } from "@/lib/skills-data";

interface SkillOption {
  value: string;
  label: string;
}

interface SkillsInputProps {
  value: string[];
  onChange: (skills: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function SkillsInput({ 
  value = [], 
  onChange, 
  placeholder = "Type to search skills...",
  className 
}: SkillsInputProps) {
  const [inputValue, setInputValue] = useState("");
  
  // Convert all skills to options
  const allOptions: SkillOption[] = useMemo(() => 
    uniqueSkills.map(skill => ({
      value: skill,
      label: skill
    })), []
  );

  // Convert current value to options format
  const selectedOptions: SkillOption[] = value.map(skill => ({
    value: skill,
    label: skill
  }));

  // Handle change
  const handleChange = (newValue: MultiValue<SkillOption>) => {
    const skills = newValue ? newValue.map(option => option.value) : [];
    onChange(skills);
  };

  // Custom styles for Notion-like minimal appearance
  const customStyles: StylesConfig<SkillOption, true> = {
    control: (provided, state) => ({
      ...provided,
      minHeight: "38px",
      backgroundColor: "rgb(255, 255, 255)",
      borderColor: state.isFocused 
        ? "rgb(59, 130, 246)" 
        : "rgb(229, 231, 235)",
      borderWidth: "1px",
      borderRadius: "0.375rem",
      boxShadow: state.isFocused ? "0 0 0 2px rgba(59, 130, 246, 0.1)" : "none",
      cursor: "text",
      transition: "all 0.15s ease",
      "&:hover": {
        borderColor: state.isFocused 
          ? "rgb(59, 130, 246)" 
          : "rgb(209, 213, 219)"
      },
    }),
    menu: (provided) => ({
      ...provided,
      backgroundColor: "rgb(255, 255, 255)",
      border: "1px solid rgb(229, 231, 235)",
      borderRadius: "0.5rem",
      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
      zIndex: 9999,
      marginTop: "4px",
      overflow: "hidden"
    }),
    menuList: (provided) => ({
      ...provided,
      padding: "4px",
      maxHeight: "240px",
      overflowY: "auto",
      backgroundColor: "rgb(255, 255, 255)",
      "&::-webkit-scrollbar": {
        width: "6px"
      },
      "&::-webkit-scrollbar-track": {
        backgroundColor: "transparent"
      },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: "rgb(209, 213, 219)",
        borderRadius: "3px",
        "&:hover": {
          backgroundColor: "rgb(156, 163, 175)"
        }
      }
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isSelected 
        ? "rgb(239, 246, 255)" 
        : state.isFocused 
        ? "rgb(248, 250, 252)" 
        : "transparent",
      color: state.isSelected 
        ? "rgb(37, 99, 235)"
        : "rgb(17, 24, 39)",
      cursor: "pointer",
      padding: "6px 10px",
      fontSize: "0.875rem",
      borderRadius: "0.25rem",
      margin: "2px 0",
      transition: "background-color 0.15s ease",
      "&:active": {
        backgroundColor: "rgb(219, 234, 254)"
      }
    }),
    multiValue: (provided) => ({
      ...provided,
      backgroundColor: "rgb(243, 244, 246)",
      borderRadius: "0.25rem",
      padding: "0px",
      margin: "2px",
      border: "1px solid rgb(229, 231, 235)"
    }),
    multiValueLabel: (provided) => ({
      ...provided,
      color: "rgb(31, 41, 55)",
      fontSize: "0.8125rem",
      padding: "2px 8px",
      paddingRight: "4px"
    }),
    multiValueRemove: (provided) => ({
      ...provided,
      color: "rgb(107, 114, 128)",
      cursor: "pointer",
      padding: "0 4px",
      borderRadius: "0 0.25rem 0.25rem 0",
      transition: "all 0.15s ease",
      "&:hover": {
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        color: "rgb(239, 68, 68)"
      }
    }),
    placeholder: (provided) => ({
      ...provided,
      color: "rgb(156, 163, 175)",
      fontSize: "0.875rem"
    }),
    input: (provided) => ({
      ...provided,
      color: "rgb(17, 24, 39)",
      fontSize: "0.875rem",
      "& input": {
        font: "inherit"
      }
    }),
    noOptionsMessage: (provided) => ({
      ...provided,
      color: "rgb(107, 114, 128)",
      fontSize: "0.875rem",
      padding: "8px 12px"
    }),
    loadingMessage: (provided) => ({
      ...provided,
      color: "rgb(107, 114, 128)",
      fontSize: "0.875rem"
    }),
    dropdownIndicator: (provided) => ({
      ...provided,
      display: "none"
    }),
    indicatorSeparator: (provided) => ({
      ...provided,
      display: "none"
    }),
    clearIndicator: (provided) => ({
      ...provided,
      display: "none"
    }),
    valueContainer: (provided) => ({
      ...provided,
      padding: "2px 8px",
      gap: "4px"
    })
  };

  // Filter options based on input
  const filterOption = (option: { label: string; value: string }, inputValue: string) => {
    return option.label.toLowerCase().includes(inputValue.toLowerCase());
  };

  return (
    <CreatableSelect
      isMulti
      value={selectedOptions}
      onChange={handleChange}
      options={allOptions}
      inputValue={inputValue}
      onInputChange={setInputValue}
      placeholder={placeholder}
      styles={customStyles}
      className={className}
      classNamePrefix="skills-select"
      isClearable={false}
      filterOption={filterOption}
      noOptionsMessage={() => 
        inputValue ? `Press Enter to add "${inputValue}"` : "Start typing to search skills..."
      }
      formatCreateLabel={(inputValue) => `Add custom: "${inputValue}"`}
      createOptionPosition="first"
      menuPlacement="auto"
      menuPosition="fixed"
      blurInputOnSelect={false}
      closeMenuOnSelect={false}
      hideSelectedOptions={false}
      components={{
        DropdownIndicator: null,
        IndicatorSeparator: null
      }}
    />
  );
}